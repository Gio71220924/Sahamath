/**
 * CuanMeter - Unified Dev Server
 * =================================
 * Jalankan : npm start  (atau: node server.js)
 * Port     : 3000
 *
 * Menggabungkan:
 *  1. Static file server  → serve semua file HTML/CSS/JS/gambar
 *  2. GET /search         → proxy TradingView symbol search (IDX)
 *  3. GET /price          → proxy TradingView real-time quote
 *  4. Auto-open browser   → buka Analyzer.html otomatis saat start
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { exec, execFile, spawn } = require('child_process');
const {
    buildIpoResponse,
    parseEipoHtml,
    parseRssIpoItems,
    readCuratedIpoCalendar,
} = require('./ipo-utils');

// Load .env (no dependency): KEY=VALUE per baris, '#' komentar, kutip opsional.
// Env var asli (shell/OS) tetap menang atas .env.
(function loadDotEnv() {
    try {
        const envPath = path.join(__dirname, '.env');
        if (!fs.existsSync(envPath)) return;
        for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
            if (!m || line.trim().startsWith('#')) continue;
            const key = m[1];
            let val = m[2].trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            if (!(key in process.env)) process.env[key] = val;
        }
    } catch { /* abaikan .env yang rusak */ }
})();

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;           // folder server.js berada
const DEFAULT = '/index.html';   // halaman yang dibuka otomatis
const DATA_DIR = path.join(ROOT, 'data');
const CALENDAR_CACHE_FILE = path.join(DATA_DIR, 'calendar-cache.json');
const CALENDAR_CACHE_VERSION = 10;
const IPO_CALENDAR_FILE = path.join(DATA_DIR, 'ipo-calendar.json');
const IPO_RSS_SOURCES_FILE = path.join(DATA_DIR, 'ipo-rss-sources.json');
const HEATMAP_CACHE_FILE = path.join(DATA_DIR, 'heatmap-cache.json');
const HEATMAP_TTL_MS = 10 * 60 * 1000;
let heatmapCache = null; // { data, cachedAt }
const watchlistCache = new Map(); // ticker -> { data, at }
const WATCHLIST_TTL_MS = 60 * 1000;
const fundamentalsCache = new Map(); // ticker -> { data, at }
const FUNDAMENTALS_TTL_MS = 24 * 60 * 60 * 1000;
const BOARD_CACHE_FILE = path.join(DATA_DIR, 'board-cache.json');

// Curated fallback for the liquid main-board (Utama) tickers the app surfaces
// most, so /board never returns "unknown" for them even while IDX's live list
// is blocked by Cloudflare. The live fetch overrides these whenever it works.
const BOARD_SEED = {
  BBCA: 'utama', BBRI: 'utama', BMRI: 'utama', BBNI: 'utama', BRIS: 'utama',
  TLKM: 'utama', ISAT: 'utama', EXCL: 'utama', TOWR: 'utama', MTEL: 'utama',
  ASII: 'utama', UNTR: 'utama', UNVR: 'utama', ICBP: 'utama', INDF: 'utama',
  KLBF: 'utama', SIDO: 'utama', SMGR: 'utama', INTP: 'utama', CPIN: 'utama',
  JPFA: 'utama', AMRT: 'utama', ACES: 'utama', MAPI: 'utama', ERAA: 'utama',
  ANTM: 'utama', INCO: 'utama', MDKA: 'utama', MBMA: 'utama', PTBA: 'utama',
  ADRO: 'utama', ADMR: 'utama', AADI: 'utama', ITMG: 'utama', MEDC: 'utama',
  PGAS: 'utama', PGEO: 'utama', BRPT: 'utama', TPIA: 'utama', BREN: 'utama',
  BUMI: 'utama', GOTO: 'utama', EMTK: 'utama', MNCN: 'utama', JSMR: 'utama',
  CUAN: 'utama', RAJA: 'utama', PTRO: 'utama', AMMN: 'utama', BRMS: 'utama',
};

function logError(context, error) {
  const message = (error && error.message) || String(error);
  // ponytail: stdout sudah ditangkap log viewer platform (HF/Railway). File log
  // di FS ephemeral tidak pernah dibaca balik — write-only, jadi dihapus.
  console.error(`[${context}]`, message);
}

function writeBoardCache() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(BOARD_CACHE_FILE, JSON.stringify(Object.fromEntries(boardCache)));
  } catch (e) { logError('Board', e); }
}

function seedBoardCache() {
  for (const [code, board] of Object.entries(BOARD_SEED)) {
    if (!boardCache.has(code)) boardCache.set(code, board);
  }
  try {
    if (fs.existsSync(BOARD_CACHE_FILE)) {
      const disk = JSON.parse(fs.readFileSync(BOARD_CACHE_FILE, 'utf8'));
      for (const [code, board] of Object.entries(disk)) boardCache.set(code, board);
    }
  } catch (e) { logError('Board', e); }
}
const KSEI_DETAIL_PAGE_LIMIT = 80;
const KSEI_EVENT_LIMIT = 160;
const KSEI_RETRY_COUNT = 2;
const KSEI_RETRY_DELAY_MS = 450;
const KSEI_MIN_CORPORATE_EVENTS = 2;
const CALENDAR_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
const MACRO_WINDOW_PAST_DAYS   = 30;
const MACRO_WINDOW_FUTURE_DAYS = 90;
let calendarRefreshInFlight = null;
let calendarRefreshBlockedUntil = 0;
let calendarLastRefreshError = null;

// ─── MIME types ──────────────────────────────────────────────────────────────
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.webmanifest': 'application/manifest+json',
};

// ─── Helper: HTTPS request to TradingView ────────────────────────────────────
function tvRequest(opts, body, callback) {
    let done = false;
    const cb = (err, data, status) => {
        if (done) return;       // guard: callback hanya boleh dipanggil sekali
        done = true;
        callback(err, data, status);
    };
    const req = https.request(opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
            try { cb(null, JSON.parse(data), res.statusCode); }
            catch (e) { cb(new Error('Parse error: ' + e.message)); }
        });
    });
    req.on('error', cb);
    req.setTimeout(8000, () => { req.destroy(); cb(new Error('Timeout')); });
    if (body) req.write(body);
    req.end();
}

function httpsGetRaw(hostname, requestPath, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname,
            path: requestPath,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/json,*/*',
            },
        }, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode} ${hostname}${requestPath}`));
                    return;
                }
                resolve(data);
            });
        });
        req.on('error', reject);
        req.setTimeout(timeout, () => {
            req.destroy();
            reject(new Error(`Timeout ${hostname}${requestPath}`));
        });
        req.end();
    });
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientNetworkError(error) {
    const msg = (error?.message || '').toLowerCase();
    return (
        msg.includes('socket hang up')
        || msg.includes('timeout')
        || msg.includes('econnreset')
        || msg.includes('etimedout')
        || msg.includes('eai_again')
        || msg.includes('network')
        || msg.includes('500')
        || msg.includes('502')
        || msg.includes('503')
        || msg.includes('504')
    );
}

async function httpsGetRawWithRetry(hostname, requestPath, options = {}) {
    const {
        retries = KSEI_RETRY_COUNT,
        timeout = 20000,
        delayMs = KSEI_RETRY_DELAY_MS,
    } = options;

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await httpsGetRaw(hostname, requestPath, timeout);
        } catch (error) {
            lastError = error;
            if (!isTransientNetworkError(error) || attempt === retries) break;
            await wait(delayMs * (attempt + 1));
        }
    }
    throw lastError;
}

const TV_HEADERS = {
    'Origin': 'https://www.tradingview.com',
    'Referer': 'https://www.tradingview.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36',
    'Accept': 'application/json',
};

// ─── Input validation helpers ────────────────────────────────────────────────
// Only allow alphanumeric, dot, dash, colon — no special chars
const TICKER_RE = /^[A-Z0-9.:\-]{1,20}$/i;
const SEARCH_RE = /^[A-Za-z0-9\s.:\-]{1,50}$/;

function validateTicker(t) {
    const clean = (t || '').trim().toUpperCase();
    if (!TICKER_RE.test(clean)) return null;
    return clean;
}

function validateSearch(q) {
    const clean = (q || '').trim();
    if (!SEARCH_RE.test(clean)) return null;
    return clean;
}

// ─── Simple in-memory rate limiter (max 30 req/min per IP) ──────────────────
const rateLimitMap = new Map();
function isRateLimited(ip) {
    const now = Date.now();
    const window = 60_000; // 1 minute
    const MAX = 30;
    let entry = rateLimitMap.get(ip);
    if (!entry || now - entry.start > window) {
        entry = { start: now, count: 0 };
        rateLimitMap.set(ip, entry);
    }
    entry.count++;
    return entry.count > MAX;
}

function ymdLocal(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Market calendar: macro events generated dynamically.
// BI RDG schedule published annually by Bank Indonesia — add new year once/year.
// KSEI corporate actions fetched daily and cached on disk.
const BI_RDG_SCHEDULE = {
    2025: [
        '2025-01-14', '2025-02-18', '2025-03-18', '2025-04-22',
        '2025-05-20', '2025-06-17', '2025-07-15', '2025-08-19',
        '2025-09-16', '2025-10-14', '2025-11-18', '2025-12-16',
    ],
    2026: [
        '2026-01-14', '2026-02-18', '2026-03-18', '2026-04-22',
        '2026-05-19', '2026-06-17', '2026-07-15', '2026-08-19',
        '2026-09-16', '2026-10-21', '2026-11-18', '2026-12-16',
    ],
};

// FOMC (The Fed) — jadwal resmi tahunan, isi 2 hari rapat [mulai, selesai].
// Sumber: federalreserve.gov/monetarypolicy/fomccalendars.htm — tambah tahun baru sekali/tahun.
const FOMC_SCHEDULE = {
    2025: [
        ['2025-01-28', '2025-01-29'], ['2025-03-18', '2025-03-19'], ['2025-05-06', '2025-05-07'],
        ['2025-06-17', '2025-06-18'], ['2025-07-29', '2025-07-30'], ['2025-09-16', '2025-09-17'],
        ['2025-10-28', '2025-10-29'], ['2025-12-09', '2025-12-10'],
    ],
    2026: [
        ['2026-01-27', '2026-01-28'], ['2026-03-17', '2026-03-18'], ['2026-04-28', '2026-04-29'],
        ['2026-06-16', '2026-06-17'], ['2026-07-28', '2026-07-29'], ['2026-09-15', '2026-09-16'],
        ['2026-10-27', '2026-10-28'], ['2026-12-08', '2026-12-09'],
    ],
};

// IDX major index rebalancing (LQ45/IDX30 dll) — efektif. Sumber: idx.co.id.
const IDX_REBALANCE = {
    2025: ['2025-02-03', '2025-08-01'],
    2026: ['2026-02-02', '2026-08-03'],
};

// Event makro sekali-jalan (pemilu, dll). Kurasi manual.
const MACRO_ONEOFF = [
    { date: '2026-11-03', label: 'Pemilu AS', title: 'US Midterm Election', detail: 'Pemilu sela AS (DPR, Senat, Gubernur). Bisa menggeser arah kebijakan ekonomi dan sentimen pasar global.', impact: 'high', source: 'US Election', url: 'https://www.usa.gov/midterm-elections' },
];

// FOMC live scraper — ambil jadwal resmi dari federalreserve.gov, fallback ke FOMC_SCHEDULE.
const FOMC_MONTHS = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};
let fomcLive = null;
let fomcTs = 0;
const FOMC_TTL = 7 * 24 * 60 * 60 * 1000; // 7 hari (jadwal jarang berubah)

function parseFomc(html) {
    const out = {};
    const pad = (n) => String(n).padStart(2, '0');
    const years = [];
    const yearRe = /(\d{4}) FOMC Meetings/g;
    let ym;
    while ((ym = yearRe.exec(html))) years.push({ year: parseInt(ym[1], 10), idx: ym.index });
    for (let i = 0; i < years.length; i++) {
        const section = html.slice(years[i].idx, i + 1 < years.length ? years[i + 1].idx : html.length);
        const meetRe = /fomc-meeting__month[^>]*>\s*<strong>([A-Za-z]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)</g;
        const list = [];
        let mm;
        while ((mm = meetRe.exec(section))) {
            const month = FOMC_MONTHS[mm[1].trim().toLowerCase()];
            if (month == null) continue;
            const nums = (mm[2].match(/\d+/g) || []).map(Number);
            if (!nums.length) continue;
            const y = years[i].year;
            const d1 = nums[0];
            const d2 = nums[nums.length - 1];
            const start = `${y}-${pad(month + 1)}-${pad(d1)}`;
            let end;
            if (d2 >= d1) {
                end = `${y}-${pad(month + 1)}-${pad(d2)}`;
            } else { // lintas bulan (mis. April 30 - May 1)
                const nm = month === 11 ? 0 : month + 1;
                const ny = month === 11 ? y + 1 : y;
                end = `${ny}-${pad(nm + 1)}-${pad(d2)}`;
            }
            list.push([start, end]);
        }
        if (list.length) out[years[i].year] = list;
    }
    return out;
}

async function refreshFomcSchedule() {
    if (fomcLive && Date.now() - fomcTs < FOMC_TTL) return;
    try {
        const html = await curlFetch('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm');
        const parsed = parseFomc(html);
        if (parsed && Object.keys(parsed).length) { fomcLive = parsed; fomcTs = Date.now(); }
    } catch (e) {
        logError('FOMC', e);
    }
}

/** @param {number} month - 0-indexed (0 = January) */
function firstBusinessDay(year, month) {
    const d = new Date(year, month, 1);
    const dow = d.getDay();
    if (dow === 0) d.setDate(2);
    else if (dow === 6) d.setDate(3);
    return ymdLocal(d);
}

/** Tanggal hari-ke-n weekday tertentu dalam sebulan. weekday: 0=Min..6=Sab. */
function nthWeekday(year, month, weekday, n) {
    const d = new Date(year, month, 1);
    let count = 0;
    while (count < n) {
        if (d.getDay() === weekday) count++;
        if (count < n) d.setDate(d.getDate() + 1);
    }
    return d;
}

/** Hari kerja terakhir dalam sebulan. */
function lastBusinessDay(year, month) {
    const d = new Date(year, month + 1, 0);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d;
}

function getMacroEvents() {
    const today = new Date();
    const from = new Date(today); from.setDate(from.getDate() - MACRO_WINDOW_PAST_DAYS);
    const until = new Date(today); until.setDate(until.getDate() + MACRO_WINDOW_FUTURE_DAYS);
    const events = [];

    // BI RDG — scan current year + next year
    for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
        const rdgDates = BI_RDG_SCHEDULE[year];
        if (!rdgDates) continue;
        for (const date of rdgDates) {
            const d = new Date(date + 'T00:00:00');
            if (d < from || d > until) continue;
            const endD = new Date(d); endD.setDate(endD.getDate() + 1);
            events.push({
                id: `bi-rdg-${date}`,
                date,
                endDate: ymdLocal(endD),
                category: 'macro',
                label: 'BI Rate',
                title: 'RDG Bank Indonesia',
                detail: 'Rapat Dewan Gubernur BI. Pantau arah suku bunga, rupiah, dan sentimen sektor bank.',
                impact: 'high',
                source: 'Bank Indonesia',
                url: 'https://www.bi.go.id/en/publikasi/Kalender/',
            });
        }
    }

    // BPS — first business day of each month, up to 30 days back, up to 3 months ahead
    for (let offset = -1; offset <= 3; offset++) {
        const ref = new Date(today.getFullYear(), today.getMonth() + offset, 1);
        const date = firstBusinessDay(ref.getFullYear(), ref.getMonth());
        const d = new Date(date + 'T00:00:00');
        if (d < from || d > until) continue;
        const monthLabel = ref.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        events.push({
            id: `bps-${date}`,
            date,
            category: 'macro',
            label: 'BPS',
            title: `Rilis Data Ekonomi ${monthLabel}`,
            detail: 'Data ekonomi bulanan BPS: inflasi, nilai tukar petani, pariwisata, dan indikator lainnya.',
            impact: 'medium',
            source: 'BPS',
            url: 'https://www.bps.go.id/id/statistics-table',
        });
    }

    const years = [today.getFullYear(), today.getFullYear() + 1];

    // FOMC (The Fed) — pakai jadwal live dari Fed (refresh di background), fallback hardcode
    refreshFomcSchedule();
    const fomcData = fomcLive || FOMC_SCHEDULE;
    for (const year of years) {
        for (const [start, end] of (fomcData[year] || [])) {
            const d = new Date(start + 'T00:00:00');
            if (d < from || d > until) continue;
            const endD = new Date(end + 'T00:00:00'); endD.setDate(endD.getDate() + 1);
            events.push({
                id: `fomc-${start}`, date: start, endDate: ymdLocal(endD),
                category: 'macro', label: 'The Fed', title: 'FOMC Meeting',
                detail: 'Rapat FOMC The Fed. Pasar mencermati arah suku bunga dan kebijakan moneter AS.',
                impact: 'high', source: 'Federal Reserve',
                url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
            });
        }
    }

    // FTSE Russell rebalancing — efektif Jumat ke-3 Mar/Jun/Sep/Des
    for (const year of years) {
        for (const month of [2, 5, 8, 11]) {
            const d = nthWeekday(year, month, 5, 3);
            if (d < from || d > until) continue;
            const date = ymdLocal(d);
            events.push({
                id: `ftse-${date}`, date, category: 'macro', label: 'FTSE',
                title: 'FTSE Russell Rebalancing',
                detail: 'Efektif rebalancing indeks FTSE. Saham masuk/keluar indeks bisa menggeser arus dana pasif.',
                impact: 'high', source: 'FTSE Russell', url: 'https://www.ftserussell.com/',
            });
        }
    }

    // MSCI index review — efektif hari kerja terakhir Feb/Mei/Agu/Nov (SAIR Feb & Agu, QIR Mei & Nov)
    for (const year of years) {
        for (const month of [1, 4, 7, 10]) {
            const d = lastBusinessDay(year, month);
            if (d < from || d > until) continue;
            const date = ymdLocal(d);
            const sair = (month === 1 || month === 7);
            events.push({
                id: `msci-${date}`, date, category: 'macro', label: 'MSCI',
                title: sair ? 'MSCI Semi-Annual Index Review' : 'MSCI Quarterly Index Review',
                detail: 'Efektif review indeks MSCI. Perubahan konstituen memengaruhi arus dana pasif (emerging market).',
                impact: 'high', source: 'MSCI',
                url: 'https://www.msci.com/our-solutions/indexes/index-review',
            });
        }
    }

    // IDX major index rebalancing (LQ45/IDX30 dll)
    for (const year of years) {
        for (const date of (IDX_REBALANCE[year] || [])) {
            const d = new Date(date + 'T00:00:00');
            if (d < from || d > until) continue;
            events.push({
                id: `idx-rebal-${date}`, date, category: 'macro', label: 'IDX',
                title: 'Rebalancing Indeks IDX',
                detail: 'Efektif evaluasi mayor indeks IDX (LQ45, IDX30, dll). Cermati saham yang masuk/keluar.',
                impact: 'medium', source: 'IDX', url: 'https://www.idx.co.id/',
            });
        }
    }

    // Event makro sekali-jalan
    for (const ev of MACRO_ONEOFF) {
        const d = new Date(ev.date + 'T00:00:00');
        if (d < from || d > until) continue;
        events.push({ id: `oneoff-${ev.date}`, category: 'macro', ...ev });
    }

    return events;
}

function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}

function startOfMonth(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function monthWeekRange(date = new Date(), weekNumber = 1) {
    const safeWeek = Math.max(1, Math.min(parseInt(weekNumber, 10) || 1, 4));
    const start = new Date(date.getFullYear(), date.getMonth(), 1 + ((safeWeek - 1) * 7));
    const end = safeWeek === 4
        ? endOfMonth(date)
        : new Date(date.getFullYear(), date.getMonth(), safeWeek * 7, 23, 59, 59, 999);
    return { start, end, week: safeWeek };
}

function decodeHtml(text = '') {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripHtml(text = '') {
    return decodeHtml(text.replace(/<[^>]*>/g, ' '));
}

function shortVenueName(venue = '') {
    // Split at comma OR street address marker (Jl./Jalan/No.)
    const firstPart = venue.split(/,|\.\s+(?:Jl|Jalan|No)\b|\s+Jl\.\s/i)[0].trim();
    const noFloor = firstPart
        .replace(/\s+\d{1,3}(?:st|nd|rd|th)?\s+(?:floor|lt|lantai)\b.*/i, '')
        .replace(/\s+(?:lt|lantai)\.?\s*\d+\b.*/i, '')
        .trim();
    const beforeParen = noFloor.replace(/\s*\(.*$/, '').trim();
    return beforeParen.length >= 4 ? beforeParen : noFloor;
}

function parseRupsDescription(description = '') {
    const timeMatch = description.match(/Waktu\s*:\s*(\d{1,2}:\d{2})\s*WIB/i);
    const venueMatch = description.match(/Tempat\s*:\s*(.+)/i);
    return {
        time: timeMatch ? timeMatch[1] : null,
        venue: venueMatch ? venueMatch[1].trim() : null,
    };
}

function parseDivAmount(raw) {
    // Indonesian format: period = thousand sep, comma = decimal sep
    const normalized = raw.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(normalized);
    if (isNaN(num)) return raw;
    // Round to max 2 decimal places, strip trailing zeros
    const rounded = Math.round(num * 100) / 100;
    // Format back to Indonesian: comma as decimal separator
    return rounded % 1 === 0
        ? rounded.toLocaleString('id-ID')
        : rounded.toFixed(2).replace('.', ',');
}

function summarizeCorporateAction(label, description = '') {
    const divMatch = description.match(/Rp\s*([\d.,]+)/i);
    if ((label === 'Dividen' || /dividen/i.test(description)) && divMatch) {
        return `Div ${parseDivAmount(divMatch[1])} rupiah/lembar`;
    }

    if (label === 'RUPS' || label === 'RUPO') {
        const { time, venue } = parseRupsDescription(description);
        const venueName = venue ? shortVenueName(venue) : null;
        if (time && venueName) return `Pukul ${time} WIB · ${venueName}`;
        if (time) return `Pukul ${time} WIB`;
        if (venueName) return venueName;
    }

    return description.length > 72 ? description.slice(0, 69) + '...' : description;
}

function formatRupsDetail(description = '') {
    const { time, venue } = parseRupsDescription(description);
    if (!time && !venue) return description;
    const lines = [];
    if (time) lines.push(`Pukul ${time} WIB`);
    if (venue) lines.push(`Tempat: ${venue}`);
    return lines.join('\n');
}

function isIdxStockTicker(code = '') {
    return /^[A-Z]{4}$/.test(code);
}

function isAllowedCalendarEvent(event = {}) {
    if (event.category === 'macro') return true;
    if (event.category === 'corporate') return isIdxStockTicker(event.ticker || '');
    return false;
}

function normalizeCalendarEvent(event = {}) {
    if (event.category !== 'corporate') return event;
    const detailText = `${event.detail || ''} ${event.summary || ''}`;
    if (/dividen/i.test(detailText)) {
        return {
            ...event,
            label: 'Dividen',
            summary: event.summary || summarizeCorporateAction('Dividen', detailText),
        };
    }
    return event;
}

function countCorporateEvents(events = []) {
    return events.filter(event => event.category === 'corporate').length;
}

function kseiTypeFromPath(detailPath = '') {
    if (detailPath.includes('/cum/')) return { label: 'Cum Date', type: 'cum' };
    if (detailPath.includes('/rec/')) return { label: 'Record Date', type: 'rec' };
    if (detailPath.includes('/eff/')) return { label: 'Effective Date', type: 'eff' };
    return { label: 'Corporate Action', type: 'ca' };
}

function kseiPathPriority(detailPath = '') {
    if (detailPath.includes('/cum/')) return 0;
    if (detailPath.includes('/rec/')) return 1;
    if (detailPath.includes('/eff/')) return 2;
    return 3;
}

function actionLabelFromDetail(html = '') {
    const upper = html.toUpperCase();
    if (upper.includes('DIVIDEN')) return 'Dividen';
    if (upper.includes('CASH DIVIDEND')) return 'Dividen';
    if (upper.includes('RUPS') || upper.includes('RUPO')) return 'RUPS';
    if (upper.includes('RIGHT')) return 'Rights';
    if (upper.includes('STOCK SPLIT')) return 'Stock Split';
    if (upper.includes('SHARE DIVIDEND')) return 'Share Div';
    return 'Corp Act';
}

const INDO_MONTHS = {
    januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06',
    juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12',
};

// "25 Juni 2026" -> "2026-06-25"; null kalau tidak cocok / "-"
function parseIndoDate(s = '') {
    const m = s.trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (!m) return null;
    const mo = INDO_MONTHS[m[2].toLowerCase()];
    if (!mo) return null;
    return `${m[3]}-${mo}-${m[1].padStart(2, '0')}`;
}

// Ambil isi <span> di bawah <b>Label:</b> dari blok detail KSEI.
function extractKseiBlockField(block = '', label = '') {
    const re = new RegExp(`<b>\\s*${label}:\\s*</b>[\\s\\S]*?<span>\\s*([^<]+?)\\s*</span>`, 'i');
    const m = block.match(re);
    return m ? decodeHtml(m[1]).trim() : '';
}

function parseKseiDetail(html, eventDate, detailPath) {
    const type = kseiTypeFromPath(detailPath);
    const blocks = html.match(/<section class="accordion accordion--nested accordion--last">[\s\S]*?<\/section>/g) || [];
    const events = [];

    for (const block of blocks) {
        const codeMatch = block.match(/<b>\s*Security Code:\s*<\/b>[\s\S]*?<span>\s*([^<]+?)\s*<\/span>/i);
        if (!codeMatch) continue;
        const nameMatch = block.match(/<b>\s*Security Name:\s*<\/b>[\s\S]*?<span>\s*([^<]+?)\s*<\/span>/i);
        const descMatch = block.match(/<dt[^>]*>\s*CA Description\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/i);

        const ticker = decodeHtml(codeMatch[1]).trim().toUpperCase();
        if (!isIdxStockTicker(ticker)) continue;

        const securityName = nameMatch ? decodeHtml(nameMatch[1]) : '';
        const description = descMatch ? stripHtml(descMatch[1]) : '';
        const label = actionLabelFromDetail(`${block} ${description}`);
        const isRups = label === 'RUPS' || label === 'RUPO';

        // RUPS: tanggal yang relevan = tanggal pelaksanaan (KSEI "Effective Date"),
        // bukan record/halaman date. Ambil dari blok; fallback ke tanggal halaman.
        let evDate = eventDate;
        let evType = type.type;
        let evLabel = type.label;
        if (isRups) {
            const effIso = parseIndoDate(extractKseiBlockField(block, 'Effective Date'));
            if (effIso) {
                evDate = effIso;
                evType = 'rups';
                evLabel = 'RUPS';
            }
        }

        const shortDesc = (!isRups && description.length > 110) ? description.slice(0, 107) + '...' : description;
        const summary = summarizeCorporateAction(label, description);
        const detail = isRups
            ? (formatRupsDetail(description) || shortDesc || `${securityName || ticker} masuk jadwal ${evLabel} KSEI.`)
            : (shortDesc || `${securityName || ticker} masuk jadwal ${evLabel} KSEI.`);

        events.push({
            id: `ksei-${evType}-${evDate}-${ticker}`,
            date: evDate,
            category: 'corporate',
            label,
            ticker,
            title: `${ticker} - ${evLabel}`,
            detail,
            summary: summary || `${ticker} ${evLabel}`,
            impact: evType === 'cum' ? 'high' : 'medium',
            source: 'KSEI',
            url: `https://web.ksei.co.id${detailPath}`,
            eventType: evType,
            securityName,
        });
    }

    return events;
}

async function fetchKseiCalendarEvents() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const from = startOfMonth(today);
    const until = endOfMonth(addMonths(today, 1));

    const months = [today, addMonths(today, 1)];
    const detailItems = [];

    for (const monthDate of months) {
        const month = String(monthDate.getMonth() + 1).padStart(2, '0');
        const year = monthDate.getFullYear();
        const raw = await httpsGetRawWithRetry('web.ksei.co.id', `/ksei_calendar/get_json/event-${month}-${year}-all.json`);
        const json = JSON.parse(raw);
        for (const group of (json.data || [])) {
            for (const item of (group.events || [])) {
                if (!item.start || !item.description) continue;
                const date = new Date(`${item.start}T00:00:00`);
                if (date < from || date > until) continue;
                detailItems.push({ date: item.start, path: item.description });
            }
        }
    }

    const uniqueDetails = [...new Map(detailItems.map(item => [`${item.date}|${item.path}`, item])).values()]
        .sort((a, b) => {
            const pa = kseiPathPriority(a.path);
            const pb = kseiPathPriority(b.path);
            if (pa !== pb) return pa - pb;
            return a.date.localeCompare(b.date);
        });
    const events = [];
    let skippedDetails = 0;
    for (const item of uniqueDetails.slice(0, KSEI_DETAIL_PAGE_LIMIT)) {
        try {
            const html = await httpsGetRawWithRetry('web.ksei.co.id', item.path);
            events.push(...parseKseiDetail(html, item.date, item.path));
        } catch (e) {
            skippedDetails++;
            if (!isTransientNetworkError(e) && !item.path.includes('/eff/')) {
                console.error('[Calendar] KSEI detail error:', e.message);
            }
        }
        await wait(120);
    }

    if (skippedDetails > 0) {
        console.warn(`[Calendar] KSEI skipped ${skippedDetails} detail page(s) after retry.`);
    }

    // Dedup by id: RUPS yang sama bisa muncul dari halaman /rec/ & /eff/ (id-nya kini sama).
    const deduped = [...new Map(events.map(e => [e.id, e])).values()];

    if (countCorporateEvents(deduped) < KSEI_MIN_CORPORATE_EVENTS) {
        throw new Error(`KSEI corporate events too low (${countCorporateEvents(deduped)}), skip cache write`);
    }

    return deduped.slice(0, KSEI_EVENT_LIMIT);
}

async function fetchIdxCorporateActions() {
    // IDX corporate actions API endpoint:
    //   https://www.idx.co.id/primary/TradingData/GetCorporateAction
    // Expected request params:
    //   indexFrom=0, pageSize=80, type=, code=, startDate=YYYY-MM-DD, endDate=YYYY-MM-DD
    //
    // NOTE: IDX website is protected by Cloudflare and blocks automated requests (curl, HTTPS client).
    // Browser-based JavaScript clients (with Cloudflare challenges enabled) can reach it.
    // A headless browser solution (Puppeteer/Playwright) or Cloudflare bypass is required for production use.
    //
    // For now, return empty array. When Cloudflare access is available, uncomment the fetch logic:
    /*
    const today = new Date();
    const startDate = ymdLocal(new Date(today.getFullYear(), today.getMonth(), 1));
    const endDate   = ymdLocal(new Date(today.getFullYear(), today.getMonth() + 2, 0));
    const path = `/primary/TradingData/GetCorporateAction?indexFrom=0&pageSize=80&type=&code=&startDate=${startDate}&endDate=${endDate}`;

    const raw = await httpsGetRawWithRetry('www.idx.co.id', path, { timeout: 15000 });
    const json = JSON.parse(raw);
    const events = [];

    for (const item of (json.Results || [])) {
        // Use actual field names from IDX API response (found via browser inspection)
        const ticker = ((item.Code || item.StockCode || '')).toUpperCase().trim();
        if (!isIdxStockTicker(ticker)) continue;

        const actionType = item.TypeCA || item.ActionType || '';
        const label = actionLabelFromDetail(actionType + ' ' + (item.Detail || item.Description || ''));
        const cumDate = item.CumDate || item.ExDate || null;
        const payDate = item.PayDate || item.PaymentDate || null;

        if (cumDate) {
            events.push({
                id: `idx-cum-${cumDate.slice(0, 10)}-${ticker}`,
                date: cumDate.slice(0, 10),
                category: 'corporate',
                label,
                ticker,
                title: `${ticker} - Cum Date`,
                detail: item.Detail || item.Description || `${ticker} ${label}`,
                summary: item.Detail || item.Description || label,
                impact: 'high',
                source: 'IDX',
                url: 'https://www.idx.co.id/en/market-data/corporate-actions/',
                eventType: 'cum',
            });
        }

        if (payDate && payDate.slice(0, 10) !== (cumDate || '').slice(0, 10)) {
            events.push({
                id: `idx-pay-${payDate.slice(0, 10)}-${ticker}`,
                date: payDate.slice(0, 10),
                category: 'corporate',
                label,
                ticker,
                title: `${ticker} - Payment Date`,
                detail: item.Detail || item.Description || `${ticker} ${label}`,
                summary: item.Detail || item.Description || label,
                impact: 'medium',
                source: 'IDX',
                url: 'https://www.idx.co.id/en/market-data/corporate-actions/',
                eventType: 'pay',
            });
        }
    }

    return events;
    */
    return [];
}

function readCalendarCache() {
    try {
        if (!fs.existsSync(CALENDAR_CACHE_FILE)) return null;
        const cache = JSON.parse(fs.readFileSync(CALENDAR_CACHE_FILE, 'utf8'));
        if (cache.version !== CALENDAR_CACHE_VERSION) return null;
        if (cache.cache_date !== ymdLocal()) return null;
        if (!Array.isArray(cache.events)) return null;
        return cache;
    } catch {
        return null;
    }
}

function writeCalendarCache(events) {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        const payload = {
            version: CALENDAR_CACHE_VERSION,
            cache_date: ymdLocal(),
            generated_at: new Date().toISOString(),
            events,
        };
        fs.writeFileSync(CALENDAR_CACHE_FILE, JSON.stringify(payload, null, 2));
        return payload;
    } catch (e) {
        console.error('[Calendar] Cache write error:', e.message);
        return { generated_at: new Date().toISOString(), events };
    }
}

function getCalendarFallback(errorMessage) {
    const stale = (() => {
        try {
            if (!fs.existsSync(CALENDAR_CACHE_FILE)) return null;
            return JSON.parse(fs.readFileSync(CALENDAR_CACHE_FILE, 'utf8'));
        } catch {
            return null;
        }
    })();
    const staleEvents = (stale?.events || []).filter(isAllowedCalendarEvent);
    const canUseStale = countCorporateEvents(staleEvents) >= KSEI_MIN_CORPORATE_EVENTS;
    const fallbackEvents = canUseStale ? staleEvents : getMacroEvents();
    return {
        generated_at: canUseStale ? stale.generated_at : new Date().toISOString(),
        events: fallbackEvents,
        cached: canUseStale,
        error: errorMessage,
    };
}

async function loadCalendarCache(forceRefresh = false) {
    if (!forceRefresh) {
        const cached = readCalendarCache();
        if (cached) return { ...cached, cached: true };
    }

    if (!forceRefresh && calendarRefreshBlockedUntil > Date.now()) {
        return getCalendarFallback(calendarLastRefreshError || 'KSEI refresh paused after recent failure');
    }

    // Start background KSEI fetch if not already running
    if (!calendarRefreshInFlight) {
        calendarRefreshInFlight = (async () => {
            try {
                const kseiEvents = await fetchKseiCalendarEvents();
                console.log(`[Calendar] KSEI: ${countCorporateEvents(kseiEvents)} corporate action events`);

                let idxEvents = [];
                try {
                    idxEvents = await fetchIdxCorporateActions();
                    if (idxEvents.length > 0) console.log(`[Calendar] IDX: ${idxEvents.length} corporate action events`);
                } catch (e) {
                    console.warn('[Calendar] IDX fetch skipped:', e.message);
                }

                const kseiKeys = new Set(kseiEvents.map(e => `${e.date}|${e.ticker}|${e.eventType}`));
                const kseiTickerDates = new Set(
                    kseiEvents.filter(e => e.eventType === 'ca').map(e => `${e.date}|${e.ticker}`)
                );
                const idxUnique = idxEvents.filter(e =>
                    !kseiKeys.has(`${e.date}|${e.ticker}|${e.eventType}`) &&
                    !kseiTickerDates.has(`${e.date}|${e.ticker}`)
                );

                const allEvents = [...getMacroEvents(), ...kseiEvents, ...idxUnique].filter(isAllowedCalendarEvent);
                writeCalendarCache(allEvents);
                calendarLastRefreshError = null;
                calendarRefreshBlockedUntil = 0;
                console.log(`[Calendar] Background refresh selesai: ${allEvents.length} events.`);
            } catch (e) {
                calendarLastRefreshError = e.message;
                calendarRefreshBlockedUntil = Date.now() + CALENDAR_REFRESH_COOLDOWN_MS;
                console.warn('[Calendar] Background refresh gagal:', e.message);
            } finally {
                calendarRefreshInFlight = null;
            }
        })();
    }

    // On a fresh deploy there is no disk cache yet. Wait once so the public site
    // does not render a macro-only calendar while KSEI is still warming up.
    if (forceRefresh || !fs.existsSync(CALENDAR_CACHE_FILE)) {
        await calendarRefreshInFlight;
        const refreshed = readCalendarCache();
        if (refreshed) return { ...refreshed, cached: true };
        return getCalendarFallback(calendarLastRefreshError || 'KSEI belum tersedia.');
    }

    // Return immediately with macro + stale KSEI while background fetch refreshes cache.
    return getCalendarFallback('KSEI sedang dimuat di background, refresh untuk data lengkap.');
}

function handleCalendar(query, res) {
    const type = (query.type || 'all').toString().toLowerCase();
    const range = query.range === 'week' ? 'week' : 'month';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekRange = monthWeekRange(today, query.week);
    const maxLimit = range === 'week' ? 80 : 300;
    const defaultLimit = range === 'week' ? 40 : 300;
    const limit = Math.max(1, Math.min(parseInt(query.limit || String(defaultLimit), 10) || defaultLimit, maxLimit));
    const forceRefresh = query.refresh === '1';
    const rangeStart = range === 'week' ? weekRange.start : startOfMonth(today);
    const rangeEnd = range === 'week' ? weekRange.end : endOfMonth(today);

    loadCalendarCache(forceRefresh).then((calendar) => {
        const filtered = calendar.events
        .filter(isAllowedCalendarEvent)
        .filter(event => type === 'all' || event.category === type)
        .map(normalizeCalendarEvent)
        .map(event => {
            const eventDate = event.date ? new Date(event.date + 'T00:00:00') : null;
            const daysUntil = eventDate ? Math.round((eventDate - today) / 86400000) : null;
            return { ...event, daysUntil };
        })
        .filter(event => {
            if (!event.date) return false;
            const eventDate = new Date(event.date + 'T00:00:00');
            return eventDate >= rangeStart && eventDate <= rangeEnd;
        })
        .sort((a, b) => {
            const av = a.daysUntil === null ? 999 : a.daysUntil;
            const bv = b.daysUntil === null ? 999 : b.daysUntil;
            return av - bv;
        })
        .slice(0, limit);

        sendJSON(res, 200, {
            status: 'success',
            generated_at: calendar.generated_at || new Date().toISOString(),
            cached: calendar.cached,
            error: calendar.error || null,
            range,
            week: range === 'week' ? weekRange.week : null,
            range_start: ymdLocal(rangeStart),
            range_end: ymdLocal(rangeEnd),
            events: filtered,
            sources: [
                { name: 'Bank Indonesia', url: 'https://www.bi.go.id/en/publikasi/Kalender/' },
                { name: 'BPS', url: 'https://www.bps.go.id/assets/arc' },
                { name: 'KSEI', url: 'https://web.ksei.co.id/ksei-calendar?setLocale=id-ID' },
                { name: 'IDX', url: 'https://www.idx.co.id/en/market-data/corporate-actions/' },
            ],
        });
    }).catch((e) => {
        sendJSON(res, 500, { status: 'error', message: e.message });
    });
}

// ─── /search  →  TradingView symbol search ───────────────────────────────────
function handleSearch(query, exchange, res) {
    const params = new URLSearchParams({
        text: query.toUpperCase(),
        exchange: exchange || 'IDX',
    });

    tvRequest({
        hostname: 'symbol-search.tradingview.com',
        path: `/symbol_search/?${params}`,
        method: 'GET',
        headers: TV_HEADERS,
    }, null, (err, tvData) => {
        if (err) { return sendJSON(res, 502, { error: err.message }); }

        const symbols = Array.isArray(tvData) ? tvData : (tvData.symbols || []);
        const results = symbols
            .filter(s =>
                s.exchange && s.exchange.toUpperCase().includes('IDX') &&
                s.type !== 'warrant' &&
                !s.symbol.includes('-W') && !s.symbol.includes('-R') && !s.symbol.includes('.')
            )
            .slice(0, 10)
            .map(s => ({
                symbol: s.symbol,
                name: s.description || s.symbol,
                type: s.type || 'stock',
                exchange: s.exchange,
            }));

        sendJSON(res, 200, { results });
    });
}

// ─── /price  →  TradingView real-time quote via scanner ──────────────────────
function handlePrice(ticker, res) {
    const body = JSON.stringify({
        symbols: { tickers: [`IDX:${ticker.toUpperCase()}`] },
        columns: ['close', 'open', 'high', 'low', 'volume', 'change', 'change_abs',
            'market_cap_basic', 'description'],
    });

    tvRequest({
        hostname: 'scanner.tradingview.com',
        path: '/global/scan',
        method: 'POST',
        headers: { ...TV_HEADERS, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, body, (err, data) => {
        if (err) { return sendJSON(res, 502, { error: err.message }); }

        const item = data?.data?.[0];
        if (!item) { return sendJSON(res, 404, { error: 'Ticker not found' }); }

        const [close, open, high, low, volume, change, changeAbs, marketCap, description] = item.d;
        sendJSON(res, 200, {
            ticker: ticker.toUpperCase(),
            description: description || ticker,
            price: close,
            open, high, low,
            volume: volume,
            change_pct: change,
            change_abs: changeAbs,
            market_cap: marketCap,
        });
    });
}

// ─── Data: Real-time Stock Prices for Marquee ────────────────────────────────
let stockPrices = {
    'IDX:COMPOSITE': { price: 0, change: 0, pct: 0 },
    'IDX:LQ45':      { price: 0, change: 0, pct: 0 },
    'IDX:BBCA':      { price: 0, change: 0, pct: 0 },
    'IDX:BBRI':      { price: 0, change: 0, pct: 0 },
    'IDX:BBNI':      { price: 0, change: 0, pct: 0 },
    'IDX:BMRI':      { price: 0, change: 0, pct: 0 },
    'IDX:BUMI':      { price: 0, change: 0, pct: 0 },
    'IDX:TLKM':      { price: 0, change: 0, pct: 0 },
    'IDX:ASII':      { price: 0, change: 0, pct: 0 },
    'IDX:ANTM':      { price: 0, change: 0, pct: 0 },
    'IDX:ADMR':      { price: 0, change: 0, pct: 0 },
    'IDX:PTBA':      { price: 0, change: 0, pct: 0 },
    'IDX:AADI':      { price: 0, change: 0, pct: 0 },
    'IDX:MBMA':      { price: 0, change: 0, pct: 0 },
    'IDX:GOTO':      { price: 0, change: 0, pct: 0 },
    'BINANCE:BTCUSDT': { price: 0, change: 0, pct: 0 },
    'OANDA:XAUUSD':    { price: 0, change: 0, pct: 0 },
};

function fetchMarketData() {
    const tickers = Object.keys(stockPrices);
    const body = JSON.stringify({
        symbols: { tickers: tickers },
        columns: ['close', 'change', 'change_abs'],
    });

    tvRequest({
        hostname: 'scanner.tradingview.com',
        path: '/global/scan',
        method: 'POST',
        headers: { ...TV_HEADERS, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, body, (err, data) => {
        if (err) { console.error('[Marquee Error]', err.message); return; }
        
        const items = data?.data || [];
        items.forEach(item => {
            const ticker = item.s;
            const [price, pct, change] = item.d;
            if (stockPrices[ticker]) {
                stockPrices[ticker] = { price, change, pct };
            }
        });
        console.log(`[Marquee] Updated ${items.length} prices from TradingView`);
    });
}

// Update setiap 15 detik (aman & real-time)
fetchMarketData();
setInterval(fetchMarketData, 15000);

// ─── Board Cache (IDX Papan Pencatatan) ──────────────────────────────────────
const boardCache = new Map(); // ticker → 'utama' | 'pengembangan' | 'akselerasi' | 'ekonomi_baru'

function normalizeBoard(raw) {
    if (!raw) return 'unknown';
    const s = raw.toString().toLowerCase();
    if (s.includes('akseler') || s.includes('acceler')) return 'akselerasi';
    if (s.includes('ekonomi') || s.includes('economy') || s === 'ne') return 'ekonomi_baru';
    if (s.includes('pengembangan') || s.includes('develop')) return 'pengembangan';
    if (s.includes('utama') || s.includes('main')) return 'utama';
    return 'unknown';
}

function fetchBoardList() {
    const qs = 'start=0&length=9999&board=0&key=';
    const req = https.request({
        hostname: 'www.idx.co.id',
        path: `/primary/StockData/GetStockList?${qs}`,
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://www.idx.co.id/',
            'Origin': 'https://www.idx.co.id',
        },
    }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
            try {
                const trimmed = data.trim();
                if (res.statusCode >= 400 || trimmed.startsWith('<')) {
                    console.warn(`[Board] IDX returned non-JSON response (status ${res.statusCode}); keeping existing cache.`);
                    return;
                }
                const json = JSON.parse(data);
                const list = json.data || json.Data || json.results || json.Results || [];
                if (!Array.isArray(list) || list.length === 0) {
                    console.warn('[Board] IDX returned empty list, status:', res.statusCode);
                    return;
                }
                let count = 0;
                list.forEach(item => {
                    const code = (
                        item.code || item.Code || item.symbol || item.Symbol ||
                        item.KodeEmiten || item.Kode || ''
                    ).toString().trim().toUpperCase();
                    const boardRaw = (
                        item.board || item.Board || item.listingBoard || item.ListingBoard ||
                        item.papan || item.Papan || item.PapanPencatatan || item.market || ''
                    ).toString().trim();
                    if (code && boardRaw) {
                        boardCache.set(code, normalizeBoard(boardRaw));
                        count++;
                    }
                });
                console.log(`[Board] Loaded ${count} tickers from IDX (${boardCache.size} cached)`);
                if (count > 0) writeBoardCache();
            } catch (e) {
                logError('Board', e);
            }
        });
    });
    req.on('error', (e) => console.error('[Board] Fetch error:', e.message));
    req.setTimeout(15000, () => { req.destroy(); console.error('[Board] Timeout'); });
    req.end();
}

seedBoardCache();
fetchBoardList();
setInterval(fetchBoardList, 24 * 60 * 60 * 1000); // refresh tiap 24 jam

// ─── /board  →  IDX papan pencatatan lookup ──────────────────────────────────
function handleBoard(ticker, res) {
    const board = boardCache.get(ticker.toUpperCase()) || 'unknown';
    sendJSON(res, 200, { ticker: ticker.toUpperCase(), board, cached: boardCache.size });
}

// ─── /ml-predict  →  Run ML prediction script ────────────────────────────────
function handleMLPredict(ticker, res) {
    console.log(`[ML Request] Menghitung prediksi untuk: ${ticker}`);

    // Menjalankan script python: python predict.py <ticker>
    // Karena predict.py ada di folder yang sama dengan server.js
    const python = spawn('python', [path.join(ROOT, 'predict.py'), ticker]);

    let output = '';
    python.stdout.on('data', (data) => {
        output += data.toString();
    });

    python.stderr.on('data', (data) => {
        console.error(`[Python Error] ${data}`);
    });

    python.on('close', (code) => {
        try {
            // Bersihkan output: ambil hanya bagian antara { dan }
            const start = output.indexOf('{');
            const end = output.lastIndexOf('}');
            if (start === -1 || end === -1) throw new Error("Format output Python tidak valid");

            const cleanJson = output.substring(start, end + 1);
            const jsonResult = JSON.parse(cleanJson);
            sendJSON(res, 200, jsonResult);
        } catch (e) {
            console.error(`[Parse Error] ${e.message}. Raw output: ${output}`);
            sendJSON(res, 500, { error: "Prediksi tidak tersedia saat ini." });
        }
    });

}

// ─── /screener  →  Run screener script ───────────────────────────────────────
function handleScreener(req, res) {
    const parsed     = url.parse(req.url, true);
    const strategies = /^[a-z,]+$/.test(parsed.query.strategies || '') ? parsed.query.strategies : 'triple';
    const mode       = parsed.query.mode === 'or' ? 'or' : 'and';

    console.log(`[Screener] Scan 14 emiten | strategies=${strategies} mode=${mode}`);

    const python = spawn('python', [
        path.join(ROOT, 'screener.py'),
        '--strategies', strategies,
        '--mode', mode,
    ]);
    let output = '';
    let timedOut = false;
    let timer = setTimeout(() => {
        timedOut = true;
        python.kill();
        sendJSON(res, 504, { status: 'error', message: 'Screener timeout (>90 detik)' });
    }, 90000);

    python.stdout.on('data', (data) => { output += data.toString(); });
    python.stderr.on('data', (data) => { console.error(`[Screener Error] ${data}`); });

    python.on('close', () => {
        if (timedOut) return;
        clearTimeout(timer);
        try {
            const result = JSON.parse(output.trim());
            sendJSON(res, 200, result);
        } catch (e) {
            console.error(`[Screener Parse Error] ${e.message}`);
            sendJSON(res, 500, { status: 'error', message: 'Gagal parse output screener' });
        }
    });
}

// ─── /heatmap  →  Sector treemap data (cache 10 menit) ───────────────────────
function storeHeatmapResult(output) {
    const result = JSON.parse(output.trim());
    if (result.status !== 'ok') throw new Error(result.message || 'status bukan ok');
    heatmapCache = { data: result, cachedAt: Date.now() };
    try { fs.writeFileSync(HEATMAP_CACHE_FILE, JSON.stringify(result)); } catch (e) {}
    return result;
}

function handleHeatmap(req, res) {
    if (heatmapCache && Date.now() - heatmapCache.cachedAt < HEATMAP_TTL_MS) {
        return sendJSON(res, 200, heatmapCache.data);
    }

    console.log('[Heatmap] Refresh data sektor...');
    const python = spawn('python', [path.join(ROOT, 'heatmap.py')]);
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        python.kill();
        serveHeatmapFallback(res);
    }, 30000);

    python.stdout.on('data', (data) => { output += data.toString(); });
    python.stderr.on('data', (data) => { console.error(`[Heatmap Error] ${data}`); });

    python.on('close', () => {
        if (timedOut) return;
        clearTimeout(timer);
        try {
            sendJSON(res, 200, storeHeatmapResult(output));
        } catch (e) {
            console.error(`[Heatmap Parse Error] ${e.message}`);
            serveHeatmapFallback(res);
        }
    });
}

// Pre-warm cache saat server boot supaya user pertama tidak menunggu spawn Python.
function warmHeatmapCache() {
    console.log('[Heatmap] Pre-warming cache...');
    const python = spawn('python', [path.join(ROOT, 'heatmap.py')]);
    let output = '';
    python.stdout.on('data', (data) => { output += data.toString(); });
    python.stderr.on('data', (data) => { console.error(`[Heatmap Warm] ${data}`); });
    python.on('close', () => {
        try {
            const r = storeHeatmapResult(output);
            const total = r.sectors.reduce((s, sec) => s + sec.stocks.length, 0);
            console.log(`[Heatmap] Cache warm: ${r.sectors.length} sektor, ${total} saham.`);
        } catch (e) {
            console.error(`[Heatmap Warm Error] ${e.message}`);
        }
    });
}

function serveHeatmapFallback(res) {
    if (heatmapCache) return sendJSON(res, 200, heatmapCache.data);
    try {
        if (fs.existsSync(HEATMAP_CACHE_FILE)) {
            const disk = JSON.parse(fs.readFileSync(HEATMAP_CACHE_FILE, 'utf8'));
            heatmapCache = { data: disk, cachedAt: 0 }; // serve now, refresh on next hit
            return sendJSON(res, 200, disk);
        }
    } catch (e) {}
    sendJSON(res, 503, { status: 'error', message: 'Heatmap belum siap, coba lagi sebentar.' });
}

// ─── /watchlist  →  Batch quotes + 7d sparkline (cache 60 dtk per ticker) ─────
function handleWatchlist(query, res) {
    const raw = String(query.tickers || '').toUpperCase();
    const tickers = [...new Set(raw.split(',').map(t => t.trim()).filter(t => /^[A-Z]{4}$/.test(t)))].slice(0, 50);
    if (!tickers.length) { return sendJSON(res, 200, { status: 'ok', quotes: {} }); }

    const now = Date.now();
    const quotes = {};
    const stale = [];
    for (const t of tickers) {
        const c = watchlistCache.get(t);
        if (c && now - c.at < WATCHLIST_TTL_MS) quotes[t] = c.data;
        else stale.push(t);
    }
    if (!stale.length) { return sendJSON(res, 200, { status: 'ok', quotes }); }

    const python = spawn('python', [path.join(ROOT, 'watchlist.py'), stale.join(',')]);
    let output = '';
    let done = false;
    const finish = () => { if (done) return; done = true; sendJSON(res, 200, { status: 'ok', quotes }); };
    const timer = setTimeout(() => { python.kill(); finish(); }, 20000);

    python.stdout.on('data', (d) => { output += d.toString(); });
    python.stderr.on('data', (d) => { console.error(`[Watchlist] ${d}`); });
    python.on('close', () => {
        clearTimeout(timer);
        try {
            const result = JSON.parse(output.trim());
            if (result.status === 'ok' && result.quotes) {
                for (const [t, q] of Object.entries(result.quotes)) {
                    watchlistCache.set(t, { data: q, at: Date.now() });
                    quotes[t] = q;
                }
            }
        } catch (e) {
            console.error(`[Watchlist] Parse error: ${e.message}`);
        }
        finish();
    });
}

// ─── /fundamentals  →  Key fundamentals via yfinance .info (cache 24 jam) ─────
function handleFundamentals(query, res) {
    const ticker = String(query.ticker || '').toUpperCase().trim();
    if (!/^[A-Z]{4}$/.test(ticker)) {
        return sendJSON(res, 400, { status: 'error', message: 'Ticker tidak valid' });
    }
    const c = fundamentalsCache.get(ticker);
    if (c && Date.now() - c.at < FUNDAMENTALS_TTL_MS) { return sendJSON(res, 200, c.data); }

    const python = spawn('python', [path.join(ROOT, 'fundamentals.py'), ticker]);
    let output = '';
    let done = false;
    const timer = setTimeout(() => {
        python.kill();
        if (!done) { done = true; sendJSON(res, 504, { status: 'error', message: 'Timeout memuat fundamental' }); }
    }, 20000);

    python.stdout.on('data', (d) => { output += d.toString(); });
    python.stderr.on('data', (d) => { console.error(`[Fundamentals] ${d}`); });
    python.on('close', () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
            const result = JSON.parse(output.trim());
            if (result.status === 'ok') fundamentalsCache.set(ticker, { data: result, at: Date.now() });
            sendJSON(res, 200, result);
        } catch (e) {
            console.error(`[Fundamentals] Parse error: ${e.message}`);
            sendJSON(res, 502, { status: 'error', message: 'Gagal memuat fundamental' });
        }
    });
}

// ─── /portfolio  →  Risk-profile portfolio optimizer (MPT) ───────────────────
const RISK_PROFILES = new Set(['conservative', 'moderate', 'aggressive']);

function handlePortfolio(query, res) {
    const risk = RISK_PROFILES.has(String(query.risk || '').toLowerCase())
        ? String(query.risk).toLowerCase()
        : 'moderate';
    const tickers = [...new Set(
        String(query.tickers || '').toUpperCase().split(',')
            .map(t => t.trim())
            .filter(t => /^[A-Z]{4}$/.test(t))
    )].slice(0, 12);

    const args = [path.join(ROOT, 'portfolio.py'), '--risk', risk];
    if (tickers.length) args.push('--tickers', tickers.join(','));

    const python = spawn('python', args);
    let output = '';
    let done = false;
    const finish = (status, obj) => { if (done) return; done = true; clearTimeout(timer); sendJSON(res, status, obj); };
    const timer = setTimeout(() => {
        python.kill();
        finish(504, { status: 'error', message: 'Optimasi portofolio timeout (>45 detik)' });
    }, 45000);

    python.stdout.on('data', (d) => { output += d.toString(); });
    python.stderr.on('data', (d) => { console.error(`[Portfolio] ${d}`); });
    python.on('close', () => {
        try {
            finish(200, JSON.parse(output.trim()));
        } catch (e) {
            logError('Portfolio', e);
            finish(502, { status: 'error', message: 'Gagal memproses optimasi portofolio' });
        }
    });
}

// ─── /ai-analysis  →  Gemini news-catalyst + sentiment per emiten ────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.5-flash';
const AI_CACHE = new Map();                 // ticker -> { ts, data }
const AI_TTL = 3 * 60 * 60 * 1000;          // 3 jam (berita cepat basi)

// Nama emiten untuk query berita yang lebih akurat (fallback: kode + "saham").
const EMITEN_NAMES = {
    BBCA: 'Bank Central Asia', BBRI: 'Bank Rakyat Indonesia', BMRI: 'Bank Mandiri',
    BBNI: 'Bank Negara Indonesia', TLKM: 'Telkom Indonesia', ASII: 'Astra International',
    UNVR: 'Unilever Indonesia', ICBP: 'Indofood CBP', INDF: 'Indofood Sukses Makmur',
    KLBF: 'Kalbe Farma', SMGR: 'Semen Indonesia', ANTM: 'Aneka Tambang',
    ADRO: 'Adaro Energy', PTBA: 'Bukit Asam', ITMG: 'Indo Tambangraya', MEDC: 'Medco Energi',
    PGAS: 'Perusahaan Gas Negara', UNTR: 'United Tractors', GOTO: 'GoTo Gojek Tokopedia',
    BUMI: 'Bumi Resources', BREN: 'Barito Renewables', CUAN: 'Petrindo Jaya Kreasi',
    MDKA: 'Merdeka Copper Gold', BRPT: 'Barito Pacific', AMRT: 'Sumber Alfaria Trijaya',
    CPIN: 'Charoen Pokphand', MAPI: 'Mitra Adiperkasa', AKRA: 'AKR Corporindo',
    INCO: 'Vale Indonesia', TINS: 'Timah', ELSA: 'Elnusa', EXCL: 'XL Axiata',
    ISAT: 'Indosat Ooredoo', WIKA: 'Wijaya Karya', PTPP: 'PP Persero', ADHI: 'Adhi Karya',
};

function decodeXmlEntities(s) {
    return String(s || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/<[^>]+>/g, '')
        .trim();
}

// Parse Google News RSS → daftar { title, source, date, link }.
function parseGoogleNews(xml, limit = 6) {
    const items = [];
    const blocks = String(xml).split(/<item>/).slice(1);
    for (const raw of blocks) {
        const titleRaw = (raw.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
        const link = decodeXmlEntities((raw.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '');
        const pub = decodeXmlEntities((raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '');
        const src = decodeXmlEntities((raw.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || '');
        let title = decodeXmlEntities(titleRaw);
        // Google News kemas judul sebagai "Judul - Sumber"; pisahkan kalau perlu.
        let source = src;
        if (!source && / - [^-]+$/.test(title)) {
            const idx = title.lastIndexOf(' - ');
            source = title.slice(idx + 3);
            title = title.slice(0, idx);
        }
        if (title) items.push({ title, source: source || 'Google News', date: pub, link });
        if (items.length >= limit) break;
    }
    return items;
}

async function fetchText(url, ms = 12000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
        return await r.text();
    } finally {
        clearTimeout(t);
    }
}

function buildAiPrompt(ticker, name, articles) {
    const list = articles.length
        ? articles.map((a, i) => `${i + 1}. "${a.title}" — ${a.source}${a.date ? ` (${a.date})` : ''}`).join('\n')
        : '(tidak ada berita ditemukan)';
    return `Kamu analis saham IDX yang ngobrol santai ala Gen Z tapi tetap akurat. Analisis emiten ${ticker} (${name}).

BERITA TERKINI (HANYA pakai ini, JANGAN mengarang berita di luar daftar):
${list}

Tugas:
- Tentukan sentimen keseluruhan dari berita di atas.
- Ekstrak katalis konkret (mis. laporan keuangan/lapkeu, dividen, akuisisi, ekspansi, downgrade, regulasi). Sebutkan sumbernya.
- Kalau daftar berita kosong/tidak relevan, set sentimen "netral" dan katalis kosong, dan bilang belum ada katalis signifikan.
- Bahasa Indonesia, ringkas, padat. Bukan ajakan beli/jual.`;
}

async function callGemini(prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1400,
            thinkingConfig: { thinkingBudget: 0 }, // matikan "thinking" 2.5 Flash agar JSON tak terpotong
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'object',
                properties: {
                    sentimen: { type: 'string', enum: ['positif', 'negatif', 'netral', 'campuran'] },
                    ringkasan: { type: 'string' },
                    katalis: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                judul: { type: 'string' },
                                dampak: { type: 'string', enum: ['positif', 'negatif', 'netral'] },
                                sumber: { type: 'string' },
                            },
                            required: ['judul', 'dampak'],
                        },
                    },
                    risiko: { type: 'string' },
                    outlook: { type: 'string' },
                },
                required: ['sentimen', 'ringkasan', 'katalis'],
            },
        },
    };
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    try {
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error?.message || `Gemini HTTP ${r.status}`);
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return JSON.parse(text);
    } finally {
        clearTimeout(t);
    }
}

async function handleAiAnalysis(query, res) {
    const ticker = String(query.ticker || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    if (ticker.length !== 4) { sendJSON(res, 400, { status: 'error', message: 'Kode saham harus 4 huruf.' }); return; }

    const cached = AI_CACHE.get(ticker);
    if (cached && Date.now() - cached.ts < AI_TTL) { sendJSON(res, 200, { ...cached.data, cached: true }); return; }

    if (!GEMINI_API_KEY) {
        sendJSON(res, 503, { status: 'error', message: 'Analisis AI belum dikonfigurasi (GEMINI_API_KEY belum di-set di server).' });
        return;
    }

    const name = EMITEN_NAMES[ticker] || ticker;
    try {
        const q = encodeURIComponent(`${name} saham`);
        const rssUrl = `https://news.google.com/rss/search?q=${q}&hl=id-ID&gl=ID&ceid=ID:id`;
        let articles = [];
        try {
            articles = parseGoogleNews(await fetchText(rssUrl), 6);
        } catch (e) {
            logError('AiAnalysis/RSS', e);
        }

        const analysis = await callGemini(buildAiPrompt(ticker, name, articles));
        const data = {
            status: 'ok',
            ticker,
            name,
            generated_at: new Date().toISOString(),
            articles,
            analysis,
            disclaimer: 'Ringkasan AI dari berita publik — bukan rekomendasi investasi. Verifikasi ke sumber asli.',
        };
        AI_CACHE.set(ticker, { ts: Date.now(), data });
        sendJSON(res, 200, data);
    } catch (e) {
        logError('AiAnalysis', e);
        sendJSON(res, 502, { status: 'error', message: 'Gagal membuat analisis AI. Coba lagi nanti.' });
    }
}

// ─── /ipo-news  →  Kalender IPO terstruktur (scrape e-ipo.co.id) ──────────────
const IPO_CACHE = { ts: 0, data: null };
const IPO_TTL = 3 * 60 * 60 * 1000; // 3 jam
const EIPO_BASE = 'https://e-ipo.co.id';

function stripTags(s) {
    return String(s || '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

// Parse halaman e-ipo /id/home → daftar IPO terstruktur.
function parseEipo(html) {
    const out = [];
    const listIdx = html.indexOf('id="ipo-list"');
    const region = listIdx >= 0 ? html.slice(listIdx) : html;
    const parts = region.split(/data-key="(\d+)"/).slice(1); // [id, chunk, id, chunk, ...]
    for (let i = 0; i < parts.length; i += 2) {
        const id = parts[i];
        const chunk = parts[i + 1] || '';
        const stage = stripTags((chunk.match(/pricing-title[^>]*>\s*<h3>([\s\S]*?)<\/h3>/) || [])[1]);
        const logoM = chunk.match(/img-list"\s+src="([^"]+)"\s+alt="([^"]*)"/);
        const logo = logoM ? EIPO_BASE + logoM[1].replace(/&amp;/g, '&') : null;
        const code = logoM ? logoM[2] : '';
        const nameBlock = (chunk.match(/padding5">\s*<h5[^>]*>([\s\S]*?)<\/h5>/) || [])[1] || '';
        const syariah = /Syariah/i.test(nameBlock);
        let name = stripTags(nameBlock.replace(/<span[\s\S]*?<\/span>/gi, ''));
        if (code) name = name.replace(new RegExp('\\(\\s*' + code + '\\s*\\)'), '').trim();

        const fields = [];
        const featSec = (chunk.match(/pricing-features">([\s\S]*?)<\/ul>/) || [])[1] || '';
        const liRe = /<li>\s*<h5[^>]*>([\s\S]*?)<\/h5>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/li>/g;
        let m;
        while ((m = liRe.exec(featSec))) {
            const label = stripTags(m[1]);
            const value = stripTags(m[2]);
            if (!label || /prospektus/i.test(label)) continue; // prospektus ditangani terpisah
            if (value) fields.push({ label, value });
        }
        const prosM = chunk.match(/href="(\/id\/pipeline\/get-propectus-file[^"]*)"/);
        const prospektus = prosM ? EIPO_BASE + prosM[1].replace(/&amp;/g, '&') : null;
        const detM = chunk.match(/href="(\/id\/ipo\/[^"]+)"/);
        const detail = detM ? EIPO_BASE + detM[1].replace(/&amp;/g, '&') : `${EIPO_BASE}/id/home`;

        // Beri peran ke field generik agar kartu bisa menonjolkan harga + tanggal.
        const pick = (re) => fields.find((f) => re.test(f.label)) || {};
        const priceF = pick(/harga/i);
        const dateF = pick(/periode|tanggal/i);
        const closed = /closed|selesai|pencatatan|listing/i.test(stage);

        if (code || name) out.push({
            id, code, name, stage, syariah, logo, prospektus, detail, closed,
            priceLabel: priceF.label || '', price: priceF.value || '',
            dateLabel: dateF.label || '', date: dateF.value || '',
            sector: pick(/sektor/i).value || '',
            lot: pick(/saham ditawarkan|ditawarkan/i).value || '',
            info: pick(/informasi/i).value || '',
        });
    }
    return out.slice(0, 12);
}

// e-ipo pakai Cloudflare yang memblok TLS-fingerprint Node fetch (403 "Just a moment").
// curl lolos, jadi shell-out ke curl. URL konstan → aman dari injeksi.
function curlFetch(url) {
    return new Promise((resolve, reject) => {
        execFile('curl', [
            '-s', '-L', '-m', '15',
            '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
            '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            '-H', 'Accept-Language: id-ID,id;q=0.9,en;q=0.8',
            url,
        ], { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
            if (err) return reject(err);
            resolve(stdout);
        });
    });
}

// Scrape e-ipo via Python curl_cffi (impersonasi TLS Chrome) — lolos Cloudflare
// dari IP datacenter (Railway), beda dari curl biasa yang kena 403 "Just a moment".
function pyScrapeIpo() {
    return new Promise((resolve, reject) => {
        const py = spawn('python', [path.join(ROOT, 'ipo_scrape.py')]);
        let out = '';
        let err = '';
        const t = setTimeout(() => { py.kill(); reject(new Error('ipo_scrape timeout')); }, 30000);
        py.stdout.on('data', (d) => { out += d.toString(); });
        py.stderr.on('data', (d) => { err += d.toString(); });
        py.on('error', (e) => { clearTimeout(t); reject(e); });
        py.on('close', () => {
            clearTimeout(t);
            if (out && out.length > 500) resolve(out);
            else reject(new Error('ipo_scrape kosong: ' + err.slice(0, 200)));
        });
    });
}

// HTML e-ipo: utamakan curl_cffi (Python), fallback ke curl (jalan dari IP rumahan/lokal).
async function fetchEipoHtml() {
    try {
        const html = await pyScrapeIpo();
        if (/ipo-list|data-key=/.test(html)) return html; // konten asli (bukan challenge page)
    } catch (e) {
        logError('IpoScrape/py', e);
    }
    return curlFetch(`${EIPO_BASE}/id/home`);
}

const DEFAULT_IPO_RSS_SOURCES = [
    {
        name: 'Google News IPO BEI',
        url: 'https://news.google.com/rss/search?q=IPO%20BEI%20OR%20e-IPO%20when:30d&hl=id&gl=ID&ceid=ID:id',
    },
];

function getIpoRssSources() {
    const fromEnv = String(process.env.IPO_RSS_URLS || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((rssUrl, index) => ({ name: `IPO RSS ${index + 1}`, url: rssUrl }));
    if (fromEnv.length) return fromEnv;

    try {
        if (fs.existsSync(IPO_RSS_SOURCES_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(IPO_RSS_SOURCES_FILE, 'utf8'));
            if (Array.isArray(parsed) && parsed.length) {
                return parsed
                    .filter((source) => source && source.url)
                    .map((source, index) => ({
                        name: source.name || `IPO RSS ${index + 1}`,
                        url: source.url,
                    }));
            }
        }
    } catch (e) {
        logError('IpoRss/source', e);
    }
    return DEFAULT_IPO_RSS_SOURCES;
}

function fetchTextUrl(rawUrl, timeout = 12000) {
    return new Promise((resolve, reject) => {
        let parsed;
        try { parsed = new URL(rawUrl); }
        catch { reject(new Error(`Invalid URL: ${rawUrl}`)); return; }

        const client = parsed.protocol === 'http:' ? http : https;
        const req = client.request(parsed, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SahamathBot/1.0)',
                'Accept': 'application/rss+xml,application/xml,text/xml,text/html,*/*',
            },
        }, (response) => {
            let data = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => {
                if (response.statusCode >= 400) {
                    reject(new Error(`HTTP ${response.statusCode} ${rawUrl}`));
                    return;
                }
                resolve(data);
            });
        });
        req.on('error', reject);
        req.setTimeout(timeout, () => {
            req.destroy();
            reject(new Error(`Timeout ${rawUrl}`));
        });
        req.end();
    });
}

async function fetchIpoRssItems() {
    const sources = getIpoRssSources();
    const results = await Promise.allSettled(sources.map(async (source) => {
        const xml = await fetchTextUrl(source.url);
        return parseRssIpoItems(xml, source.name);
    }));
    const items = [];
    for (const result of results) {
        if (result.status === 'fulfilled') items.push(...result.value);
        else logError('IpoRss/fetch', result.reason);
    }
    const seen = new Set();
    return items.filter((item) => {
        const key = item.code || item.detail || item.name;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 8);
}

async function handleIpoNews(res) {
    if (IPO_CACHE.data && Date.now() - IPO_CACHE.ts < IPO_TTL) {
        sendJSON(res, 200, { ...IPO_CACHE.data, cached: true });
        return;
    }
    try {
        const generatedAt = new Date().toISOString();
        const curated = readCuratedIpoCalendar(IPO_CALENDAR_FILE);
        let rssItems = [];
        let liveItems = [];

        if (!curated.length) {
            rssItems = await fetchIpoRssItems();
        }

        if (!curated.length && !rssItems.length && process.env.IPO_ALLOW_LIVE_SCRAPE === '1') {
            const html = await fetchEipoHtml();
            liveItems = parseEipoHtml(html, EIPO_BASE);
        }

        const data = liveItems.length
            ? buildIpoResponse({ curated: liveItems, rssItems: [], generatedAt })
            : buildIpoResponse({ curated, rssItems, generatedAt });
        if (liveItems.length) data.source = 'e-ipo-live';
        if (data.items.length) { IPO_CACHE.ts = Date.now(); IPO_CACHE.data = data; } // jangan cache hasil kosong
        sendJSON(res, 200, data);
    } catch (e) {
        logError('IpoNews', e);
        sendJSON(res, 502, { status: 'error', message: 'Gagal memuat kalender IPO.' });
    }
}

// ─── Helper: send JSON with CORS ─────────────────────────────────────────────
function sendJSON(res, status, obj) {
    if (res.headersSent || res.writableEnded) return; // jangan crash kalau response sudah dikirim
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(obj));
}

// ─── Static file server ──────────────────────────────────────────────────────
function serveStatic(pathname, res) {
    // Default index
    if (pathname === '/' || pathname === '') pathname = DEFAULT;

    const filePath = path.join(ROOT, pathname);

    // Security: jangan keluar dari ROOT folder. Cocokkan dengan separator agar
    // direktori sibling yang namanya berawalan sama (mis. CuanMeter-Backup)
    // tidak ikut lolos prefix-check.
    const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
    if (filePath !== ROOT && !filePath.startsWith(rootWithSep)) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`File not found: ${pathname}`);
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': mime,
            'Content-Length': stat.size,
            'Cache-Control': 'no-cache',  // dev mode: always fresh
        });

        fs.createReadStream(filePath).pipe(res);
    });
}

// ─── Main HTTP server ─────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = decodeURIComponent(parsed.pathname);

    // CORS preflight
    if (req.method === 'OPTIONS') {
        sendJSON(res, 204, {}); return;
    }

    // API: /search
    if (req.method === 'GET' && pathname === '/search') {
        const ip = req.socket.remoteAddress;
        if (isRateLimited(ip)) { sendJSON(res, 429, { error: 'Too many requests' }); return; }

        const q = validateSearch(parsed.query.q);
        const exchange = validateTicker(parsed.query.exchange || 'IDX') || 'IDX';
        if (!q) { sendJSON(res, 400, { error: 'Invalid or missing ?q= (max 50 alphanumeric chars)' }); return; }
        console.log(`[Search] "${q}" (${exchange})`);
        return handleSearch(q, exchange, res);
    }

    // API: /price
    if (req.method === 'GET' && pathname === '/price') {
        const ip = req.socket.remoteAddress;
        if (isRateLimited(ip)) { sendJSON(res, 429, { error: 'Too many requests' }); return; }

        const ticker = validateTicker(parsed.query.ticker);
        if (!ticker) { sendJSON(res, 400, { error: 'Invalid or missing ?ticker= (alphanumeric, max 20 chars)' }); return; }
        console.log(`[Price]  ${ticker}`);
        return handlePrice(ticker, res);
    }

    // API: /board
    if (req.method === 'GET' && pathname === '/board') {
        const ticker = validateTicker(parsed.query.ticker);
        if (!ticker) { sendJSON(res, 400, { error: 'Missing ?ticker=' }); return; }
        return handleBoard(ticker, res);
    }

    // API: /ml-predict
    if (req.method === 'GET' && pathname === '/ml-predict') {
        const ip = req.socket.remoteAddress;
        if (isRateLimited(ip)) { sendJSON(res, 429, { error: 'Too many requests' }); return; }

        const ticker = validateTicker(parsed.query.ticker);
        if (!ticker) { sendJSON(res, 400, { error: 'Invalid or missing ?ticker=' }); return; }
        return handleMLPredict(ticker, res);
    }

    // API: /screener
    if (req.method === 'GET' && pathname === '/screener') {
        const ip = req.socket.remoteAddress;
        if (isRateLimited(ip)) { sendJSON(res, 429, { error: 'Too many requests' }); return; }
        return handleScreener(req, res);
    }

    // API: /heatmap
    if (req.method === 'GET' && pathname === '/heatmap') {
        const ip = req.socket.remoteAddress;
        if (isRateLimited(ip)) { sendJSON(res, 429, { error: 'Too many requests' }); return; }
        return handleHeatmap(req, res);
    }

    // API: /watchlist
    if (req.method === 'GET' && pathname === '/watchlist') {
        const ip = req.socket.remoteAddress;
        if (isRateLimited(ip)) { sendJSON(res, 429, { error: 'Too many requests' }); return; }
        return handleWatchlist(parsed.query, res);
    }

    // API: /fundamentals
    if (req.method === 'GET' && pathname === '/fundamentals') {
        const ip = req.socket.remoteAddress;
        if (isRateLimited(ip)) { sendJSON(res, 429, { error: 'Too many requests' }); return; }
        return handleFundamentals(parsed.query, res);
    }

    // API: /portfolio
    if (req.method === 'GET' && pathname === '/portfolio') {
        const ip = req.socket.remoteAddress;
        if (isRateLimited(ip)) { sendJSON(res, 429, { error: 'Too many requests' }); return; }
        return handlePortfolio(parsed.query, res);
    }

    // API: /ai-analysis
    if (req.method === 'GET' && pathname === '/ai-analysis') {
        const ip = req.socket.remoteAddress;
        if (isRateLimited(ip)) { sendJSON(res, 429, { error: 'Too many requests' }); return; }
        return handleAiAnalysis(parsed.query, res);
    }

    // API: /ipo-news
    if (req.method === 'GET' && pathname === '/ipo-news') {
        const ip = req.socket.remoteAddress;
        if (isRateLimited(ip)) { sendJSON(res, 429, { error: 'Too many requests' }); return; }
        return handleIpoNews(res);
    }

    // API: /calendar
    if (req.method === 'GET' && pathname === '/calendar') {
        const ip = req.socket.remoteAddress;
        if (isRateLimited(ip)) { sendJSON(res, 429, { error: 'Too many requests' }); return; }
        return handleCalendar(parsed.query, res);
    }

    // API: /api/prices/stream (SSE for Landing Page)
    if (req.method === 'GET' && (pathname === '/api/prices/stream' || pathname === '/prices/stream')) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });

        // Kirim data awal
        res.write(`data: ${JSON.stringify(stockPrices)}\n\n`);

        // Kirim data setiap 5 detik
        const interval = setInterval(() => {
            res.write(`data: ${JSON.stringify(stockPrices)}\n\n`);
        }, 5000);

        req.on('close', () => clearInterval(interval));
        return;
    }

    // Static files
    serveStatic(pathname, res);
});

// ─── Daily calendar refresh ───────────────────────────────────────────────────
function scheduleDailyCalendarRefresh() {
    const now = new Date();
    const nextMidnightWIB = new Date(now);
    nextMidnightWIB.setUTCHours(17, 0, 0, 0); // 00:00 WIB = 17:00 UTC
    if (nextMidnightWIB <= now) nextMidnightWIB.setUTCDate(nextMidnightWIB.getUTCDate() + 1);
    const msUntilMidnight = nextMidnightWIB - now;

    setTimeout(() => {
        loadCalendarCache(true)
            .then(() => console.log('[Calendar] Daily refresh selesai.'))
            .catch(e => console.error('[Calendar] Daily refresh gagal:', e.message));
        setInterval(() => {
            loadCalendarCache(true)
                .then(() => console.log('[Calendar] Daily refresh selesai.'))
                .catch(e => console.error('[Calendar] Daily refresh gagal:', e.message));
        }, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);

    console.log(`[Calendar] Daily refresh dijadwalkan dalam ${Math.round(msUntilMidnight / 60000)} menit (00:00 WIB).`);
}

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
    const baseUrl = `http://localhost:${PORT}`;
    console.log('');
    console.log('  ✅ CuanMeter Server siap!');
    console.log(`  🌐 ${baseUrl}${DEFAULT}`);
    console.log('');
    console.log('  Endpoints tersedia:');
    console.log(`  📊 ${baseUrl}/search?q=BBRI          (symbol search)`);
    console.log(`  💰 ${baseUrl}/price?ticker=BBRI       (realtime price)`);
    console.log('');
    console.log('  Tekan Ctrl+C untuk berhenti.');
    console.log('');
    scheduleDailyCalendarRefresh();

    // Pre-warm heatmap: load disk cache instantly (serve selama warm jalan), lalu refresh live.
    try {
        if (fs.existsSync(HEATMAP_CACHE_FILE)) {
            heatmapCache = { data: JSON.parse(fs.readFileSync(HEATMAP_CACHE_FILE, 'utf8')), cachedAt: Date.now() };
        }
    } catch (e) {}
    warmHeatmapCache();
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n  [Error] Port ${PORT} sudah dipakai.`);
        console.error(`  Tutup proses lain di port ${PORT} atau ganti PORT di server.js.\n`);
    } else {
        console.error('[Error]', err.message);
    }
    process.exit(1);
});

// ─── Observability: never die silently on a stray async error ────────────────
process.on('unhandledRejection', (reason) => {
    logError('UnhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
});
process.on('uncaughtException', (err) => {
    // Log and keep serving — a single bad request handler shouldn't take the
    // whole dev server down. Fatal startup errors still surface via exit above.
    logError('UncaughtException', err);
});
