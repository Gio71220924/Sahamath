/* ============================================================
   landing.jsx — CuanMeter landing page.
   Hero = kalkulator profit yang mencetak nota (printer + struk).
   ToolsGrid = pertanyaan pengguna dengan ikon isometrik (IsoIcon).
   StockMarquee & IHSGChart use TradingView widgets for live data —
   see tradingview.jsx for the wrapper.
   Exposes globals: LandingPage.
   ============================================================ */

const { useState: useStateL, useEffect: useEffectL, useMemo: useMemoL } = React;

/* ---------- Hero: kalkulator profit yang langsung mencetak nota ---------- */
const HERO_FEE_BUY = 0.0015;   // sama dengan default ProfitCalc
const HERO_FEE_SELL = 0.0025;

function HeroPrinter() {
  return (
    <svg role="img" aria-label="Printer struk kasir yang mencetak nota profit" viewBox="0 0 420 132" style={{ width: '100%', maxWidth: 420, height: 'auto', display: 'block', position: 'relative', zIndex: 2 }}>
      <defs>
        <linearGradient id="hp-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4b504c" /><stop offset="1" stopColor="#2a2d2b" /></linearGradient>
        <linearGradient id="hp-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6c716d" /><stop offset="1" stopColor="#525753" /></linearGradient>
        <linearGradient id="hp-shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ffffff" stopOpacity="0" /><stop offset="0.5" stopColor="#ffffff" stopOpacity="0.18" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" /></linearGradient>
      </defs>
      <ellipse cx="210" cy="124" rx="196" ry="8" fill="#191b1a" fillOpacity="0.12" />
      <path d="M46 14 L374 14 Q384 14 390 22 L408 50 L12 50 L30 22 Q36 14 46 14 Z" fill="url(#hp-top)" />
      <path d="M60 22 L360 22 L372 42 L48 42 Z" fill="#3e423f" />
      <rect x="12" y="50" width="396" height="66" rx="12" fill="url(#hp-body)" />
      <rect x="12" y="50" width="396" height="6" fill="url(#hp-shine)" />
      <text x="34" y="86" fill="#a4aaa3" fontSize="16" fontWeight="700" fontFamily="Satoshi, system-ui, sans-serif">sahamath</text>
      <rect x="296" y="72" width="44" height="16" rx="8" fill="#3a3e3b" stroke="#5c615d" strokeWidth="1" />
      <circle cx="366" cy="80" r="5" fill="#45c07f" />
      <rect x="38" y="104" width="344" height="9" rx="4.5" fill="#101211" />
    </svg>
  );
}

function Hero({ onNavigate }) {
  const [f, setF] = useStateL({ kode: 'BBCA', lot: 10, beli: 5125, jual: 5534 });
  const setNum = (k) => (e) => setF({ ...f, [k]: Number(e.target.value.replace(/\D/g, '')) || 0 });
  const shares = f.lot * 100;
  const buyGross = shares * f.beli;
  const buyFee = Math.round(buyGross * HERO_FEE_BUY);
  const modal = buyGross + buyFee;
  const sellGross = shares * f.jual;
  const sellFee = Math.round(sellGross * HERO_FEE_SELL);
  const terima = sellGross - sellFee;
  const net = terima - modal;
  const pct = modal ? (net / modal) * 100 : 0;
  const rp = (v) => Math.round(v).toLocaleString('id-ID');
  const color = net >= 0 ? NOTA_UP : NOTA_DOWN;
  const fields = [
    { id: 'h-kode', label: 'Kode saham', value: f.kode, mode: 'text',
      onChange: (e) => setF({ ...f, kode: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) }) },
    { id: 'h-lot', label: 'Jumlah lot', value: f.lot, mode: 'numeric', onChange: setNum('lot') },
    { id: 'h-beli', label: 'Harga beli', value: f.beli, mode: 'numeric', onChange: setNum('beli') },
    { id: 'h-jual', label: 'Harga jual', value: f.jual, mode: 'numeric', onChange: setNum('jual') },
  ];
  const input = {
    width: '100%', minHeight: 48, boxSizing: 'border-box', padding: '0 12px', border: '1px solid var(--border-strong)',
    borderRadius: 6, background: 'var(--surface)', color: 'var(--fg)', fontFamily: 'JetBrains Mono, monospace', fontSize: 16,
  };

  return (
    <section style={{ padding: '48px 0 80px' }}>
      <div className="container" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '48px 64px' }}>
        <div style={{ flex: '1 1 440px', minWidth: 0, paddingTop: 24 }}>
          <h1 style={{ fontSize: 'clamp(44px, 6vw, 76px)', lineHeight: 0.98, letterSpacing: '-0.045em', margin: 0 }}>
            Cuan-mu, terukur. Tanpa drama.
          </h1>
          <p style={{ margin: '24px 0 0', maxWidth: '44ch', fontSize: 19, lineHeight: 1.55, color: 'var(--fg-muted)' }}>
            Kalkulator saham IDX buat cek untung bersih, batas ARA dan ARB, dan risiko sebelum beli. Gratis, tanpa iklan.
          </p>
          <form onSubmit={(e) => e.preventDefault()} style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, maxWidth: 460 }}>
            {fields.map((x) => (
              <div key={x.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor={x.id} style={{ fontSize: 14, fontWeight: 600 }}>{x.label}</label>
                <input id={x.id} value={x.value} onChange={x.onChange} inputMode={x.mode} style={input} />
              </div>
            ))}
          </form>
          <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--fg-muted)' }}>
            Fee broker 0,15% beli dan 0,25% jual.{' '}
            <button type="button" onClick={() => onNavigate('profit')} style={{ font: 'inherit', color: 'var(--fg)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Ganti fee di kalkulator profit
            </button>
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
            <button className="btn btn-primary" onClick={() => onNavigate('analyzer')}>Analisa saham</button>
            <button className="btn btn-secondary" onClick={() => onNavigate('araarb')}>Cek ARA dan ARB</button>
          </div>
        </div>

        <div style={{ flex: '0 1 420px', minWidth: 300, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <HeroPrinter />
          <div style={{ width: 340, maxWidth: '100%', marginTop: -24, overflow: 'hidden', paddingBottom: 28, position: 'relative', zIndex: 1 }}>
            <div className="hero-cetak" style={{ filter: 'drop-shadow(0 12px 18px rgba(25, 27, 26, 0.16))' }}>
              <div role="region" aria-label="Nota profit" aria-live="polite" className="mono tnum" style={{ background: '#fcfcfa', color: NOTA_INK, padding: '32px 22px 18px', fontSize: 13, lineHeight: 1.8 }}>
                <div style={{ textAlign: 'center' }}>Nota profit</div>
                <NotaCut />
                <div>{f.kode || 'Saham'}, {rp(f.lot)} lot ({rp(shares)} lembar)</div>
                <NotaRow k={`Beli @ ${rp(f.beli)}`} v={rp(buyGross)} />
                <NotaRow k="Fee beli 0,15%" v={rp(buyFee)} />
                <NotaRow k="Modal keluar" v={rp(modal)} />
                <NotaCut />
                <NotaRow k={`Jual @ ${rp(f.jual)}`} v={rp(sellGross)} />
                <NotaRow k="Fee jual 0,25%" v={rp(sellFee)} />
                <NotaRow k="Uang diterima" v={rp(terima)} />
                <NotaCut />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 16, fontWeight: 700, color }}>
                  <span>{net >= 0 ? 'Untung bersih' : 'Rugi bersih'}</span><span>{rp(Math.abs(net))}</span>
                </div>
                <div style={{ textAlign: 'right', color }}>
                  {(net >= 0 ? '+' : '−') + Math.abs(pct).toFixed(2).replace('.', ',')}% dari modal
                </div>
                <NotaCut />
                <p style={{ margin: 0, textAlign: 'center' }}>Saham yang sudah dibeli<br />tidak dapat dikembalikan.</p>
              </div>
              <NotaEdge bottom />
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes hero-cetak { from { transform: translateY(-100%); } to { transform: translateY(0); } }
        .hero-cetak { animation: hero-cetak 1.6s steps(16) 0.3s both; }
        @media (prefers-reduced-motion: reduce) { .hero-cetak { animation: none; } }
      `}</style>
    </section>
  );
}

/* ---------- Stock ticker — custom real-time marquee via SSE ---------- */
const MARQUEE_SYMBOLS = [
  { key: 'IDX:COMPOSITE',   label: 'IHSG',    logo: null                            },
  { key: 'IDX:LQ45',        label: 'LQ45',    logo: null                            },
  { key: 'IDX:BBCA',        label: 'BBCA',    logo: 'bank-central-asia'           },
  { key: 'IDX:BBRI',        label: 'BBRI',    logo: 'bank-rakyat-indonesia'       },
  { key: 'IDX:BBNI',        label: 'BBNI',    logo: 'bank-negara-indonesia-persero-tbk' },
  { key: 'IDX:BMRI',        label: 'BMRI',    logo: 'bank-mandiri'                     },
  { key: 'IDX:BUMI',        label: 'BUMI',    logo: 'bumi-resources-minerals'          },
  { key: 'IDX:TLKM',        label: 'TLKM',    logo: 'tlkm-icon'                                  },
  { key: 'IDX:ASII',        label: 'ASII',    logo: 'asii-icon'                                  },
  { key: 'IDX:ANTM',        label: 'ANTM',    logo: 'antam'                                      },
  { key: 'IDX:ADMR',        label: 'ADMR',    logo: 'adaro-minerals-indonesia-tbk'               },
  { key: 'IDX:PTBA',        label: 'PTBA',    logo: 'bukit-asam-tbk'                             },
  { key: 'IDX:GOTO',        label: 'GOTO',    logo: 'goto-icon'                                  },
  { key: 'IDX:AADI',        label: 'AADI',    logo: 'aadi-icon'                                  },
  { key: 'IDX:MBMA',        label: 'MBMA',    logo: 'merdeka-battery-materials-tbk'              },
  { key: 'BINANCE:BTCUSDT', label: 'BTC/USD', logo: 'crypto/XTVCBTC'                             },
  { key: 'OANDA:XAUUSD',    label: 'GOLD',    logo: 'gold-icon'                                  },
];

function makeSvgLogo(text, bg, fg = '#fff') {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="${bg}"/><text x="10" y="14" text-anchor="middle" font-size="8" font-weight="800" font-family="sans-serif" fill="${fg}">${text}</text></svg>`
  )}`;
}

const SVG_LOGOS = {
  'tlkm-icon': makeSvgLogo('TL', '#CC0000'),
  'asii-icon': makeSvgLogo('AS', '#1B4693'),
  'goto-icon': makeSvgLogo('GT', '#00AA13'),
  'aadi-icon': makeSvgLogo('AA', '#003082'),
  'gold-icon': makeSvgLogo('Au', '#F5A623', '#7A4F00'),
};

function MarqueeLogo({ slug, label }) {
  const [err, setErr] = useStateL(false);

  let src = null;
  if (slug && SVG_LOGOS[slug]) {
    src = SVG_LOGOS[slug];
  } else if (slug && slug.startsWith('data:')) {
    src = slug;
  } else if (slug) {
    src = `https://s3-symbol-logo.tradingview.com/${slug}.svg`;
  }

  if (!src || err) {
    return (
      <div style={{
        width: 20, height: 20, borderRadius: '50%',
        background: 'var(--primary-soft)', color: 'var(--primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 8, fontWeight: 800, flexShrink: 0,
      }}>
        {label.slice(0, 2)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={label}
      width={20} height={20}
      style={{ borderRadius: '50%', flexShrink: 0, objectFit: 'contain' }}
      onError={() => setErr(true)}
    />
  );
}

function StockMarquee() {
  const [prices, setPrices] = useStateL({});
  const [paused, setPaused] = useStateL(false);

  useEffectL(() => {
    // ponytail: SSE can't go through Netlify's redirect proxy — hit Railway directly (CORS is already *).
    const es = new EventSource('https://sahamath-production.up.railway.app/api/prices/stream');
    es.onmessage = (e) => {
      try { setPrices(JSON.parse(e.data)); } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  const items = MARQUEE_SYMBOLS.map(({ key, label, logo }) => {
    const d = prices[key] || {};
    return { key, label, logo, price: d.price || 0, pct: d.pct || 0 };
  });

  const renderItem = (item, sfx) => {
    const pos = item.pct >= 0;
    return (
      <div
        key={item.key + sfx}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '0 16px', flexShrink: 0,
          borderRight: '1px solid var(--border)',
          height: 50,
        }}
      >
        <MarqueeLogo slug={item.logo} label={item.label} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg)', letterSpacing: '0.02em' }}>
          {item.label}
        </span>
        <span className="mono tnum" style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          {item.price > 0 ? item.price.toLocaleString('id-ID') : '—'}
        </span>
        {item.price > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: pos ? 'var(--success)' : 'var(--danger)',
          }}>
            {pos ? '+' : ''}{item.pct.toFixed(2)}%
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-soft)',
        overflow: 'hidden',
        height: 50,
        display: 'flex',
        alignItems: 'center',
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        width: 'max-content',
        animation: 'marqueeScroll 55s linear infinite',
        animationPlayState: paused ? 'paused' : 'running',
      }}>
        {items.map((item) => renderItem(item, '-a'))}
        {items.map((item) => renderItem(item, '-b'))}
      </div>
      <style>{`
        @keyframes marqueeScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

/* ---------- IHSG live chart — TradingView Advanced Chart widget ---------- */
function IHSGChart() {
  const tvTheme = useTVTheme();

  return (
    <section style={{ padding: '80px 0' }}>
      <div className="container">
        <SectionTitle title="Pergerakan IHSG" sub="Data live dari TradingView. Grafiknya bisa digeser, di-zoom, dan diganti timeframe-nya." />

        <div
          className="card"
          style={{
            padding: 0,
            overflow: 'hidden',
            height: 520,
          }}
        >
          <TVWidget
            widget="advanced-chart"
            height="100%"
            config={{
              autosize: true,
              symbol: 'IDX:COMPOSITE',
              interval: 'D',
              timezone: 'Asia/Jakarta',
              theme: tvTheme,
              style: '3',
              locale: 'id',
              hide_side_toolbar: true,
              allow_symbol_change: false,
              save_image: false,
              details: false,
              withdateranges: true,
              hide_legend: false,
            }}
          />
        </div>
      </div>
    </section>
  );
}

/* ---------- Market calendar widget ---------- */
const MARKET_CALENDAR_FALLBACK = [
  {
    id: 'bi-rdg-2026-05-19',
    date: '2026-05-19',
    endDate: '2026-05-20',
    category: 'macro',
    label: 'BI Rate',
    title: 'RDG Bank Indonesia',
    detail: 'Pantau arah suku bunga, rupiah, dan sentimen sektor bank.',
    impact: 'high',
    source: 'Bank Indonesia',
    url: 'https://www.bi.go.id/en/publikasi/Kalender/',
  },
  {
    id: 'bps-monthly-2026-06-01',
    date: '2026-06-01',
    category: 'macro',
    label: 'BPS',
    title: 'Rilis indikator ekonomi bulanan',
    detail: 'Inflasi, pariwisata, dan indikator bulanan dari BPS.',
    impact: 'medium',
    source: 'BPS',
    url: 'https://www.bps.go.id/assets/arc',
  },
  {
    id: 'ksei-dividend-watch',
    date: null,
    category: 'corporate',
    label: 'Dividen',
    title: 'Pantau cum/ex date dividen',
    detail: 'Cek jadwal dividen KSEI sebelum entry saham yield tinggi.',
    impact: 'medium',
    source: 'KSEI',
    url: 'https://www.ksei.co.id/publications/corporate-action-schedules/cash-dividend?setLocale=id-ID',
  },
];

function formatCalendarDate(event) {
  if (!event.date) return 'Harian';
  const start = new Date(`${event.date}T00:00:00`);
  const startLabel = start.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  if (!event.endDate) return startLabel;
  const end = new Date(`${event.endDate}T00:00:00`);
  const endLabel = end.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  return `${startLabel} - ${endLabel}`;
}

function calendarDateParts(event) {
  if (!event.date) return { day: 'Pantau', month: 'Harian' };
  const start = new Date(`${event.date}T00:00:00`);
  return {
    day: start.toLocaleDateString('id-ID', { day: '2-digit' }),
    month: start.toLocaleDateString('id-ID', { month: 'short' }),
  };
}

function formatCalendarEventTitle(event) {
  if (!event.ticker) return event.title;

  const typeLabel = {
    cum: 'cum date',
    rec: 'record date',
    eff: 'effective date',
    rups: 'RUPS',
  }[event.eventType] || 'corporate action';

  return `${event.ticker} ${typeLabel}`;
}

// "2026-10-22", "2026-10-31" → "22–31 Okt"; beda bulan → "28 Okt–3 Nov"
function formatDateRange(start, end) {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  const dm = { day: 'numeric', month: 'short' };
  const left = a.getMonth() === b.getMonth() ? a.getDate() : a.toLocaleDateString('id-ID', dm);
  return `${left}–${b.toLocaleDateString('id-ID', dm)}`;
}

function getCurrentMonthWeek(date = new Date()) {
  return Math.min(4, Math.max(1, Math.ceil(date.getDate() / 7)));
}

function impactStyle(impact, category) {
  if (impact === 'high' && category === 'macro') {
    return { color: '#b91c1c', background: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.22)' };
  }
  return { color: 'var(--primary)', background: 'var(--primary-soft)', border: 'var(--border)' };
}

function cleanVenueName(raw = '') {
  if (/elektron|virtual|online|zoom|webex/i.test(raw)) return 'Online / Elektronik';
  return raw
    // Split at address markers or KSEI participant instruction phrases
    .split(/,|\.\s+(?:Jl|Jalan|No|Rt|Rw|Kel|Kec)\b|\s+Jl\.\s|\s+Bagi\s+Pemegang|\s+Peserta\s+RUPS|\s+Yang\s+Akan\s+Hadir|\s+Pemegang\s+(?:Saham|Rekening)\s+(?:Yang|yang)/i)[0]
    .replace(/\s*\(.*$/, '')
    .replace(/\s+\d{1,3}(?:st|nd|rd|th)?\s+(?:floor|lt|lantai)\b.*/i, '')
    .replace(/\s+(?:lt|lantai)\.?\s*\d+\b.*/i, '')
    .replace(/(\s+\S+)?\s*\.{3}$/, '')
    .trim();
}

function formatRupsDisplay(text = '') {
  if (!text) return text;

  // Already server-formatted "Pukul X WIB · VenueName" — still clean up venue part
  const preFormatted = text.match(/^(Pukul \d{1,2}:\d{2} WIB)\s*·\s*(.+)$/);
  if (preFormatted) {
    return `${preFormatted[1]} · ${cleanVenueName(preFormatted[2])}`;
  }

  // Already formatted "Pukul X WIB\nTempat: ..." (server detail format)
  const detailFormatted = text.match(/^Pukul (\d{1,2}:\d{2}) WIB\n?Tempat:\s*(.+)$/s);
  if (detailFormatted) {
    return `Pukul ${detailFormatted[1]} WIB · ${cleanVenueName(detailFormatted[2])}`;
  }

  // Raw KSEI format "Waktu : HH:MM WIB - selesai Tempat : [venue]"
  const timeMatch = text.match(/Waktu\s*:\s*(\d{1,2}:\d{2})\s*WIB/i);
  const venueMatch = text.match(/Tempat\s*:\s*(.+)/i);
  const time = timeMatch ? timeMatch[1] : null;
  const rawVenue = venueMatch ? venueMatch[1].trim() : null;

  if (time && rawVenue) return `Pukul ${time} WIB · ${cleanVenueName(rawVenue)}`;
  if (time) return `Pukul ${time} WIB`;
  if (rawVenue) return cleanVenueName(rawVenue);
  return text;
}

function formatDivSummary(text = '') {
  // Fix cached summaries like "Div 0,9574 rupiah/lembar" → "Div 0,96 rupiah/lembar"
  return text.replace(/^Div\s+([\d.,]+)\s+rupiah\/lembar$/i, (_, raw) => {
    const num = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
    if (isNaN(num)) return _;
    const rounded = Math.round(num * 100) / 100;
    const formatted = rounded % 1 === 0
      ? rounded.toLocaleString('id-ID')
      : rounded.toFixed(2).replace('.', ',');
    return `Div ${formatted} rupiah/lembar`;
  });
}

function MarketCalendarWidget() {
  const [range, setRange] = useStateL('week');
  const [week, setWeek] = useStateL(getCurrentMonthWeek());
  const [events, setEvents] = useStateL([]);
  const [updatedAt, setUpdatedAt] = useStateL(null);
  const [rangeMeta, setRangeMeta] = useStateL(null);
  const [loading, setLoading] = useStateL(true);
  const [loadError, setLoadError] = useStateL(null);
  const [page, setPage] = useStateL(0);
  const PAGE_SIZE = 5;

  useEffectL(() => {
    let alive = true;
    const limit = range === 'week' ? 40 : 300;
    const weekParam = range === 'week' ? `&week=${week}` : '';
    setLoading(true);
    setLoadError(null);
    setPage(0);
    fetch(`/calendar?range=${range}${weekParam}&limit=${limit}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!alive) return;
        if (!Array.isArray(data?.events)) {
          setEvents([]);
          setLoadError('Kalender belum bisa dimuat.');
          return;
        }
        setEvents(data.events);
        setUpdatedAt(data.generated_at);
        setRangeMeta(data.range_start && data.range_end ? formatDateRange(data.range_start, data.range_end) : null);
        setLoadError(data.error && !data.cached ? 'Data KSEI belum lengkap, coba refresh lagi nanti.' : null);
      })
      .catch(() => {
        if (!alive) return;
        setEvents([]);
        setLoadError('Kalender belum bisa dimuat.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [range, week]);

  return (
    <section style={{ padding: '72px 0' }}>
      <div className="container">
        <SectionTitle
          title={range === 'week' ? `Event penting minggu ke-${week}` : 'Event penting bulan ini'}
          sub="Corporate action dan data makro yang perlu dicek sebelum masuk posisi."
          aside={updatedAt && (
            <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
              Diperbarui {new Date(updatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}{rangeMeta ? `, ${rangeMeta}` : ''}
            </span>
          )}
        />

        <div
          className="cal-events-panel"
          style={{
            display: 'grid',
            gap: 10,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow)',
            padding: 12,
          }}
        >
          <div style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            alignItems: 'center',
            flexWrap: 'wrap',
            padding: '0 2px 2px',
          }}>
            {[
              { id: 'month', label: 'Bulan ini' },
            ].map((option) => {
              const active = range === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setRange(option.id)}
                  style={{
                    border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                    background: active ? 'var(--primary-soft)' : 'var(--bg)',
                    color: active ? 'var(--primary)' : 'var(--fg-muted)',
                    borderRadius: 6,
                    padding: '7px 10px',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {option.label}
                </button>
              );
            })}
            {[1, 2, 3, 4].map((weekNo) => {
              const active = range === 'week' && week === weekNo;
              return (
                <button
                  key={weekNo}
                  type="button"
                  onClick={() => {
                    setRange('week');
                    setWeek(weekNo);
                  }}
                  style={{
                    border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                    background: active ? 'var(--primary-soft)' : 'var(--bg)',
                    color: active ? 'var(--primary)' : 'var(--fg-muted)',
                    borderRadius: 6,
                    padding: '7px 10px',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  M{weekNo}
                </button>
              );
            })}
          </div>

          <div className="cal-dot-legend">
            {[
              { color: 'var(--primary)', label: 'Dividen' },
              { color: '#3b82f6', label: 'RUPS / RUPO' },
              { color: '#b91c1c', label: 'Makro' },
            ].map(({ color, label }) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{label}</span>
              </span>
            ))}
          </div>

          {(loading || loadError || events.length === 0) && (
            <div style={{
              padding: 18,
              borderRadius: 'calc(var(--radius) - 4px)',
              border: '1px dashed var(--border)',
              background: 'var(--bg)',
              color: 'var(--fg-muted)',
              fontSize: 13,
              lineHeight: 1.5,
            }}>
              {loading ? 'Memuat kalender...' : loadError || 'Belum ada event terjadwal di range ini.'}
            </div>
          )}

          {events.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).map((event) => {
            const impact = impactStyle(event.impact, event.category);
            const dateParts = calendarDateParts(event);
            return (
              <div
                key={event.id}
                className="cal-event-card"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '76px minmax(0, 1fr) auto',
                  gap: 14,
                  alignItems: 'center',
                  padding: 14,
                  borderRadius: 'calc(var(--radius) - 4px)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                }}
              >
                <div
                  className="cal-event-datebox"
                  style={{
                    minHeight: 64,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-soft)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    position: 'relative',
                  }}
                >
                  <span className="cal-event-dot" style={{
                    background: event.label === 'Dividen' ? 'var(--primary)' :
                      (event.label === 'RUPS' || event.label === 'RUPO') ? '#3b82f6' :
                      event.category === 'macro' ? '#b91c1c' : 'var(--primary)'
                  }} />
                  <span
                    className="mono"
                    style={{
                      fontSize: event.date ? 24 : 12,
                      fontWeight: 800,
                      color: 'var(--fg)',
                      lineHeight: 1,
                    }}
                  >
                    {dateParts.day}
                  </span>
                  <span
                    className="mono"
                    style={{
                      marginTop: 5,
                      fontSize: 10,
                      fontWeight: 800,
                      color: 'var(--fg-muted)',
                    }}
                  >
                    {dateParts.month}
                  </span>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div className="cal-event-meta-mobile">
                    <span className="cal-event-dot-inline" style={{
                      background: event.label === 'Dividen' ? 'var(--primary)' :
                        (event.label === 'RUPS' || event.label === 'RUPO') ? '#3b82f6' :
                        event.category === 'macro' ? '#b91c1c' : 'var(--primary)'
                    }} />
                    <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: 'var(--fg-muted)' }}>
                      {dateParts.day} {dateParts.month}
                    </span>
                  </div>
                  <h3
                    className="cal-event-title"
                    style={{
                      fontSize: 16,
                      letterSpacing: '-0.02em',
                      marginBottom: 5,
                    }}
                  >
                    {formatCalendarEventTitle(event)}
                  </h3>
                  {event.label === 'RUPS' || event.label === 'RUPO' ? (
                    <p className="cal-event-desc" style={{ margin: 0, color: 'var(--fg-muted)', fontSize: 13, lineHeight: 1.45 }}>
                      {formatRupsDisplay(event.summary || event.detail)}
                    </p>
                  ) : (
                    <p className="cal-event-desc" style={{
                      margin: 0, color: 'var(--fg-muted)', fontSize: 13, lineHeight: 1.45,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {formatDivSummary(event.summary || event.detail || '')}
                    </p>
                  )}
                </div>

                <div className="cal-event-badge" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: '0.06em',
                      padding: '5px 7px',
                      borderRadius: 6,
                      color: impact.color,
                      background: impact.background,
                      border: `1px solid ${impact.border}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {event.label}
                  </span>
                </div>
              </div>
            );
          })}

          {events.length > PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, events.length)} dari {events.length} event
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 0}
                  style={{
                    padding: '5px 12px', fontSize: 13, fontWeight: 700,
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                    background: 'var(--bg)', color: page === 0 ? 'var(--fg-faint)' : 'var(--fg)',
                    cursor: page === 0 ? 'default' : 'pointer',
                  }}
                >‹ Prev</button>
                <button
                  type="button"
                  onClick={() => setPage(p => p + 1)}
                  disabled={(page + 1) * PAGE_SIZE >= events.length}
                  style={{
                    padding: '5px 12px', fontSize: 13, fontWeight: 700,
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                    background: 'var(--bg)', color: (page + 1) * PAGE_SIZE >= events.length ? 'var(--fg-faint)' : 'var(--fg)',
                    cursor: (page + 1) * PAGE_SIZE >= events.length ? 'default' : 'pointer',
                  }}
                >Next ›</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------- Yang bisa dicek: pertanyaan pengguna → alat, ikon isometrik ---------- */
const TOOLS = [
  { id: 'profit',   q: 'Untung bersihku berapa setelah fee?',                     cta: 'Hitung profit' },
  { id: 'araarb',   q: 'Besok paling tinggi dan paling rendah di harga berapa?',  cta: 'Cek ARA dan ARB' },
  { id: 'average',  q: 'Harga rata-rataku jadi berapa kalau nambah lot?',          cta: 'Hitung average' },
  { id: 'amunisi',  q: 'Boleh beli berapa lot kalau rugi maksimal Rp500 ribu?',   cta: 'Hitung lot aman' },
  { id: 'dividen',  q: 'Dividen siapa yang bisa diambil bulan ini?',               cta: 'Lihat jadwal dividen' },
  { id: 'analyzer', q: 'Seberapa jauh harga bisa bergerak minggu ini?',            cta: 'Buka analyzer' },
  { id: 'heatmap',  q: 'Sektor mana yang sedang panas hari ini?',                  cta: 'Buka heatmap' },
  { id: 'arena',    q: 'Mau latihan antre beli tanpa uang asli?',                  cta: 'Main di arena' },
];

function ToolsGrid({ onNavigate }) {
  return (
    <section style={{ padding: '72px 0' }}>
      <div className="container">
        <SectionTitle title="Yang bisa kamu cek di sini" />
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', columnGap: 48 }}>
          {TOOLS.map((t) => (
            <li key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <button type="button" onClick={() => onNavigate(t.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 18, padding: '14px 0', textAlign: 'left', font: 'inherit', color: 'var(--fg)', cursor: 'pointer' }}>
                <IsoIcon name={t.id} size={76} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 19, lineHeight: 1.3 }}>{t.q}</span>
                  <span style={{ display: 'block', marginTop: 4, fontSize: 15, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>{t.cta}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Panduan: baris seperti ToolsGrid ---------- */
const PREVIEW_GUIDES = [
  { title: 'Apa itu ARA dan ARB?',             desc: 'Batas naik dan turun harian di IDX, dan kenapa saham gocap bisa mentok.',     read: 5 },
  { title: 'Average down: kapan masuk akal?',  desc: 'Kapan menambah posisi saat harga turun, dan kapan lebih baik cut loss.',      read: 7 },
  { title: 'Position sizing',                  desc: 'Kenapa all-in bikin porto cepat habis, dan cara pakai batas rugi 2% per trade.', read: 6 },
  { title: 'Dividen atau capital gain?',       desc: 'Dua cara untung dari saham: satu cair saat dividen dibagi, satu saat kamu jual.', read: 4 },
];

function GuidesSection({ onNavigate }) {
  return (
    <section style={{ padding: '72px 0' }}>
      <div className="container">
        <SectionTitle
          title="Panduan singkat"
          sub="Bahasa sehari-hari, 4 sampai 7 menit baca, lalu langsung coba di kalkulator."
          aside={<button className="btn btn-secondary" onClick={() => onNavigate('guides')}>Lihat semua panduan</button>}
        />
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', columnGap: 48 }}>
          {PREVIEW_GUIDES.map((g) => (
            <li key={g.title} style={{ borderBottom: '1px solid var(--border)' }}>
              <button type="button" onClick={() => onNavigate('guides')} style={{ width: '100%', padding: '16px 0', textAlign: 'left', font: 'inherit', color: 'var(--fg)' }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
                  <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>{g.title}</span>
                  <span className="mono" style={{ fontSize: 13, color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>{g.read} menit</span>
                </span>
                <span style={{ display: 'block', marginTop: 4, fontSize: 15, lineHeight: 1.5, color: 'var(--fg-muted)' }}>{g.desc}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Penutup ---------- */
function FinalCTA({ onNavigate }) {
  return (
    <section style={{ padding: '72px 0 0' }}>
      <div className="container">
        <div style={{ paddingTop: 24, borderTop: '2px solid var(--fg)' }}>
          <h2 style={{ fontSize: 'clamp(36px, 5vw, 60px)', letterSpacing: '-0.045em', lineHeight: 1 }}>Hitung dulu, baru beli.</h2>
          <p style={{ margin: '16px 0 0', maxWidth: '48ch', fontSize: 18, lineHeight: 1.55, color: 'var(--fg-muted)' }}>
            Semua kalkulator gratis, tanpa iklan, dan tanpa daftar akun.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
            <button className="btn btn-primary" onClick={() => onNavigate('profit')}>Hitung profit</button>
            <button className="btn btn-secondary" onClick={() => onNavigate('araarb')}>Cek ARA dan ARB</button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- IpoNewsWidget — feed berita IPO BEI (Google News) ---------- */
// Logo dari e-ipo.co.id kadang gagal dimuat; jatuh ke ikon biar tidak tampil alt text terpotong.
function IpoLogo({ src, code }) {
  const [failed, setFailed] = useStateL(false);
  if (!src || failed) return <Icon name="chart" size={22} />;
  return <img src={src} alt={code} loading="lazy" onError={() => setFailed(true)} />;
}

const IPO_PREVIEW = 4;

function IpoNewsWidget() {
  const [data, setDataIpo] = useStateL(null);
  const [err, setErrIpo] = useStateL(false);
  const [showAll, setShowAll] = useStateL(false);

  useEffectL(() => {
    let alive = true;
    fetch('/ipo-news')
      .then((r) => r.json())
      .then((d) => { if (!alive) return; if (d.status === 'ok') setDataIpo(d); else setErrIpo(true); })
      .catch(() => { if (alive) setErrIpo(true); });
    return () => { alive = false; };
  }, []);

  if (err) return null;
  if (!data || !data.items || data.items.length === 0) return null; // diam sampai siap

  const stageColor = (stage) => {
    const s = (stage || '').toLowerCase();
    if (/book building/.test(s)) return 'var(--warning)';
    if (/offering|penawaran/.test(s)) return 'var(--primary)';
    if (/allotment|penjatahan/.test(s)) return 'var(--warning)';
    if (/closed|selesai|pencatatan|listing|cancel|batal/.test(s)) return 'var(--fg-muted)';
    return 'var(--primary)';
  };
  const isRssAlert = data.source === 'rss';
  const done = (it) => it.closed || /cancel|batal/i.test(it.stage || '');
  const items = [...data.items].sort((a, b) => done(a) - done(b)); // yang masih jalan di depan
  const shown = showAll ? items : items.slice(0, IPO_PREVIEW);

  return (
    <section className="ipo-sec" style={{ padding: '64px 0' }}>
      <div className="container">
        <SectionTitle
          title="IPO di BEI"
          sub={isRssAlert
            ? 'Pantauan berita IPO terbaru dari RSS. Anggap sebagai alert awal, lalu verifikasi prospektus/e-IPO.'
            : 'Jadwal book building, penawaran, dan pencatatan emiten baru dari data curated e-IPO.'}
        />

        <div className="ipo-grid">
          {shown.map((it) => {
            const sc = stageColor(it.stage);
            const shortLbl = (l) => (l || '').replace(/\s*(book building|penawaran umum|penawaran)\s*/ig, ' ').replace(/\s+/g, ' ').trim();
            const meta = [it.sector, it.lot].filter(Boolean).join(' - ');
            return (
              <div key={it.id} className={`card interactive ipo-card${done(it) ? ' ipo-closed' : ''}`}>
                <div className="ipo-top">
                  <div className="ipo-logo-box">
                    <IpoLogo src={it.logo} code={it.code} />
                  </div>
                  <span className="ipo-tag" style={{ color: sc, background: `color-mix(in oklab, ${sc} 14%, transparent)` }}>
                    {it.unverified ? 'Alert RSS' : it.stage || 'IPO'}
                  </span>
                </div>

                <div>
                  <h3 className="ipo-name">{it.name}</h3>
                  <div className="ipo-idline">
                    {it.code && <span className="mono ipo-code">{it.code}</span>}
                    {it.syariah && <span className="ipo-syariah">Syariah</span>}
                  </div>
                </div>

                {(it.price || it.date) && (
                  <div className="ipo-hero">
                    {it.price && (
                      <>
                        <div className="ipo-hero-label">{shortLbl(it.priceLabel) || 'Harga'}</div>
                        <div className="ipo-price mono tnum">{it.price}</div>
                      </>
                    )}
                    {it.date && (
                      <div className="ipo-date">
                        <span className="ipo-date-label">{shortLbl(it.dateLabel)}</span> {it.date}
                      </div>
                    )}
                  </div>
                )}

                {(meta || it.info) && (
                  <div className="ipo-metarow">
                    {meta && <div>{meta}</div>}
                    {it.info && <div className="ipo-info">{it.info}</div>}
                  </div>
                )}

                <div className="ipo-foot">
                  {it.prospektus && (
                    <a className="ipo-prospektus" href={it.prospektus} target="_blank" rel="noopener noreferrer">📄 Prospektus</a>
                  )}
                  <a className="ipo-link" href={it.detail || 'https://e-ipo.co.id/id/home'} target="_blank" rel="noopener noreferrer">
                    Info lebih lanjut <span aria-hidden="true">→</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {items.length > IPO_PREVIEW && (
          <button type="button" className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${items.length})`}
          </button>
        )}

        {data.disclaimer && (
          <p style={{ marginTop: 16, fontSize: 12, color: 'var(--fg-faint)' }}>{data.disclaimer}</p>
        )}
      </div>

      <style>{`
        .ipo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; align-items: stretch; }
        .ipo-card { padding: 22px; text-align: left; display: flex; flex-direction: column; gap: 14px; }
        .ipo-closed { opacity: 0.72; transition: opacity .2s ease; }
        .ipo-closed:hover { opacity: 1; }
        .ipo-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .ipo-logo-box { width: 52px; height: 52px; border-radius: var(--radius); background: var(--primary-soft); color: var(--primary); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
        .ipo-logo-box img { max-width: 40px; max-height: 40px; object-fit: contain; }
        .ipo-tag { font-size: 12px; font-weight: 700; padding: 4px 8px; border-radius: 6px; white-space: nowrap; }
        .ipo-name { font-size: 18px; margin: 0; letter-spacing: -0.02em; line-height: 1.25; min-height: 2.3em; }
        .ipo-idline { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
        .ipo-code { font-size: 12px; font-weight: 800; color: var(--fg-muted); }
        .ipo-syariah { font-size: 10px; font-weight: 800; color: #fff; background: var(--success); padding: 2px 8px; border-radius: 5px; }
        .ipo-hero { background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
        .ipo-hero-label { font-size: 12px; font-weight: 600; color: var(--fg-muted); }
        .ipo-price { font-size: 21px; font-weight: 800; color: var(--fg); letter-spacing: -0.01em; margin-top: 2px; line-height: 1.1; }
        .ipo-date { font-size: 12px; color: var(--fg-muted); margin-top: 8px; }
        .ipo-date-label { font-weight: 700; color: var(--fg); }
        .ipo-metarow { font-size: 12px; color: var(--fg-muted); display: flex; flex-direction: column; gap: 2px; }
        .ipo-info { color: var(--fg-faint); }
        .ipo-foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 6px; }
        .ipo-prospektus { font-size: 13px; font-weight: 700; color: var(--fg-muted); text-decoration: none; }
        .ipo-prospektus:hover { color: var(--primary); }
        .ipo-link { font-size: 14px; font-weight: 700; color: var(--primary); text-decoration: none; white-space: nowrap; }
      `}</style>
    </section>
  );
}

function LandingPage({ onNavigate }) {
  return (
    <>
      <Hero onNavigate={onNavigate} />
      <StockMarquee />
      <WatchlistWidget onNavigate={onNavigate} />
      <IHSGChart />
      <HeatmapPreview onNavigate={onNavigate} />
      <MarketCalendarWidget />
      <IpoNewsWidget />
      <ToolsGrid onNavigate={onNavigate} />
      <GuidesSection onNavigate={onNavigate} />
      <FinalCTA onNavigate={onNavigate} />
    </>
  );
}

Object.assign(window, { LandingPage });
