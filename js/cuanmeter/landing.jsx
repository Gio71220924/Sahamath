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
        <div style={{ marginBottom: 24 }}>
          <div className="badge" style={{ marginBottom: 12 }}>
            <Icon name="chart" size={12} />
            <span>IHSG · INDEKS HARGA SAHAM GABUNGAN</span>
          </div>
          <h2
            style={{
              fontSize: 'clamp(28px, 4vw, 40px)',
              letterSpacing: '-0.025em',
              marginBottom: 8,
            }}
          >
            Pergerakan IHSG <span style={{ color: 'var(--primary)' }}>real-time</span>.
          </h2>
          <p style={{ fontSize: 15, color: 'var(--fg-muted)', margin: 0 }}>
            Data live dari TradingView · interactive — drag, zoom, ganti timeframe.
          </p>
        </div>

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
    cum: 'CUM DATE',
    rec: 'RECORD DATE',
    eff: 'EFFECTIVE DATE',
    rups: 'RUPS',
  }[event.eventType] || 'CORP ACT';

  return `${event.ticker} ${typeLabel}`;
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
        setRangeMeta(data.range_start && data.range_end ? `${data.range_start} - ${data.range_end}` : null);
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
    <section
      style={{
        padding: '56px 0',
        background: 'var(--bg-soft)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="container">
        <div
          className="market-calendar-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(240px, 0.85fr) minmax(0, 1.6fr)',
            gap: 24,
            alignItems: 'stretch',
          }}
        >
          <div style={{ alignSelf: 'center' }}>
            <div className="badge" style={{ marginBottom: 14 }}>
              <Icon name="bookmark" size={12} />
              <span>MARKET CALENDAR</span>
            </div>
            <h2
              style={{
                fontSize: 'clamp(26px, 4vw, 38px)',
                lineHeight: 1.04,
                letterSpacing: '-0.03em',
                marginBottom: 12,
              }}
            >
              Event penting<br />
              <span style={{ color: 'var(--primary)' }}>{range === 'week' ? `minggu ${week}.` : 'bulan ini.'}</span>
            </h2>
            <p style={{ color: 'var(--fg-muted)', lineHeight: 1.6, margin: 0, fontSize: 14 }}>
              Corporate action dan data makro yang perlu dicek sebelum masuk posisi.
            </p>
            {updatedAt && (
              <div className="mono" style={{ marginTop: 14, fontSize: 11, color: 'var(--fg-muted)' }}>
                Sync {new Date(updatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
            {rangeMeta && (
              <div className="mono" style={{ marginTop: 6, fontSize: 11, color: 'var(--fg-muted)' }}>
                {rangeMeta}
              </div>
            )}
          </div>

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
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
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
                      <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {dateParts.day} {dateParts.month}
                      </span>
                    </div>
                    <h3
                      className="cal-event-title"
                      style={{
                        fontSize: 16,
                        letterSpacing: '-0.02em',
                        marginBottom: 5,
                        textTransform: event.ticker ? 'uppercase' : 'none',
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
      </div>

      <style>{`
        @media (max-width: 860px) {
          .market-calendar-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
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
        <h2 style={{ margin: 0, paddingTop: 24, borderTop: '2px solid var(--fg)', fontSize: 'clamp(28px, 3.5vw, 40px)', letterSpacing: '-0.03em' }}>
          Yang bisa kamu cek di sini
        </h2>
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', columnGap: 48 }}>
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

/* ---------- Guides preview section ---------- */
const PREVIEW_GUIDES = [
  { icon: 'book',   tag: 'BASIC',    title: 'Apa itu ARA & ARB?',                 desc: 'Aturan auto-rejection di IDX yang wajib lo ngerti sebelum nge-haka saham gocap.', read: '5 min' },
  { icon: 'target', tag: 'STRATEGY', title: 'Average Down: Pahlawan atau Jebakan?', desc: 'Kapan boleh average down dan kapan harusnya cut-loss. Spoiler: gak semua bottom itu real bottom.', read: '7 min' },
  { icon: 'shield', tag: 'RISK',     title: 'Position Sizing 101',                desc: 'Kenapa "all-in" itu cara tercepat buat porto sultan jadi porto receh. Pakai 2% rule.', read: '6 min' },
  { icon: 'coin',   tag: 'INCOME',   title: 'Bedanya Dividen vs Capital Gain',     desc: 'Dua cara cuan dari saham. Yang satu cair tahunan, yang satu cair pas lo jual.', read: '4 min' },
];

function GuidesSection({ onNavigate }) {
  return (
    <section
      style={{
        padding: '80px 0',
        background: 'var(--bg-soft)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="container">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 40,
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ maxWidth: 620 }}>
            <div className="badge" style={{ marginBottom: 16 }}>
              <Icon name="book" size={12} />
              <span>BELAJAR DULU, CUAN KEMUDIAN</span>
            </div>
            <h2
              style={{
                fontSize: 'clamp(32px, 4vw, 44px)',
                marginBottom: 12,
                letterSpacing: '-0.03em',
              }}
            >
              Panduan ringkas buat<br />newbie & sultan-in-the-making.
            </h2>
            <p style={{ fontSize: 16, color: 'var(--fg-muted)' }}>
              Bahasa sehari-hari, 5–7 menit baca, langsung praktek di kalkulator.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={() => onNavigate && onNavigate('guides')}>
            Lihat Semua Panduan
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          {PREVIEW_GUIDES.map((g, i) => (
            <a
              key={i}
              className="card interactive"
              onClick={() => onNavigate && onNavigate('guides')}
              style={{
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 'var(--radius)',
                  background: 'var(--primary-soft)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={g.icon} size={20} />
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11,
                  color: 'var(--fg-muted)',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                }}
              >
                <span>{g.tag}</span>
                <span>·</span>
                <span>{g.read}</span>
              </div>
              <h3 style={{ fontSize: 18, letterSpacing: '-0.02em' }}>{g.title}</h3>
              <p
                style={{
                  fontSize: 14,
                  color: 'var(--fg-muted)',
                  lineHeight: 1.55,
                  margin: 0,
                  flexGrow: 1,
                }}
              >
                {g.desc}
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--primary)',
                }}
              >
                Baca panduan <Icon name="arrow_right" size={12} />
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Final CTA — Terminal style ---------- */
const CTA_TICKER = [
  { label: 'IHSG',  val: '+0.32%', up: true  },
  { label: 'BBCA',  val: '+0.26%', up: true  },
  { label: 'BBRI',  val: '-0.40%', up: false },
  { label: 'BMRI',  val: '+1.20%', up: true  },
  { label: 'TLKM',  val: '-0.15%', up: false },
  { label: 'ANTM',  val: '+2.10%', up: true  },
  { label: 'GOTO',  val: '-1.30%', up: false },
  { label: 'BUMI',  val: '+0.85%', up: true  },
  { label: 'PTBA',  val: '+0.60%', up: true  },
  { label: 'ADMR',  val: '-0.55%', up: false },
];

function FinalCTA({ onNavigate }) {
  return (
    <section style={{ padding: '88px 0' }}>
      <div className="container">
        <div className="cta-terminal" style={{
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.07)',
          background: 'var(--cta-terminal-bg)',
          position: 'relative',
        }}>

          {/* Status bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '11px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            fontFamily: 'JetBrains Mono, IBM Plex Mono, monospace',
            fontSize: 11,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: 'var(--primary)',
              boxShadow: '0 0 8px color-mix(in oklab, var(--primary) 60%, transparent)',
            }} />
            <span style={{ color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em' }}>
              CUANMETER_TERMINAL
            </span>
            <span style={{ color: 'rgba(255,255,255,0.1)', margin: '0 4px' }}>·</span>
            <span style={{ color: 'var(--primary)', opacity: 0.6, letterSpacing: '0.08em', fontSize: 10 }}>
              IDX LIVE
            </span>
            <span style={{
              marginLeft: 'auto', color: 'rgba(255,255,255,0.12)',
              fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.06em',
            }}>
              v1.0.0
            </span>
          </div>

          {/* Main body */}
          <div style={{
            padding: 'clamp(36px, 5vw, 72px) clamp(24px, 5vw, 64px)',
            textAlign: 'center',
            position: 'relative',
          }}>

            {/* Terminal prompt */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontFamily: 'JetBrains Mono, IBM Plex Mono, monospace',
              fontSize: 12, letterSpacing: '0.06em',
              color: 'var(--primary)',
              marginBottom: 20, opacity: 0.85,
            }}>
              <span style={{ opacity: 0.5 }}>{'$'}</span>
              <span>exit nebak_mode</span>
              <span style={{ animation: 'ctaCursorBlink 1.1s step-end infinite' }}>▌</span>
            </div>

            <h2 style={{
              fontSize: 'clamp(34px, 5vw, 62px)',
              color: '#fff',
              marginBottom: 18,
              letterSpacing: '-0.04em',
              lineHeight: 0.97,
            }}>
              Stop nebak-nebak.<br />
              <span style={{ color: 'var(--primary)' }}>Mulai ngitung.</span>
            </h2>

            <p style={{
              fontSize: 14,
              color: 'rgba(255,255,255,0.38)',
              maxWidth: 460,
              margin: '0 auto 36px',
              lineHeight: 1.7,
              fontFamily: 'JetBrains Mono, IBM Plex Mono, monospace',
              letterSpacing: '-0.01em',
            }}>
              // 5 kalkulator · 1 web · free forever<br />
              // bookmark sekarang, gas pas market open
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => onNavigate('average')}
                className="btn btn-primary"
                style={{ color: '#02110a', fontWeight: 800 }}
              >
                Mulai Hitung <Icon name="arrow_right" size={16} />
              </button>
              <button
                onClick={() => onNavigate('araarb')}
                className="btn"
                style={{
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                Cek ARA/ARB
              </button>
            </div>
          </div>

          {/* Bottom ticker strip */}
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            padding: '9px 0',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              width: 'max-content',
              fontFamily: 'JetBrains Mono, IBM Plex Mono, monospace',
              fontSize: 11,
              animation: 'ctaTicker 28s linear infinite',
            }}>
              {[...CTA_TICKER, ...CTA_TICKER].map((item, i) => (
                <span key={i} style={{
                  padding: '0 18px',
                  color: item.up
                    ? 'color-mix(in oklab, var(--primary) 85%, white)'
                    : 'rgba(255,84,112,0.85)',
                  borderRight: '1px solid rgba(255,255,255,0.05)',
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                }}>
                  {item.label} <span style={{ opacity: 0.6 }}>{item.val}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ctaCursorBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes ctaTicker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </section>
  );
}

/* ---------- ProductShowcase — animated 4-panel demo (Kalkulator · Live · Arena · Analyzer) ---------- */
const SHOWCASE_TABS = [
  { id: 'calc',     label: 'Kalkulator', route: 'average',  dot: 'var(--primary)' },
  { id: 'live',     label: 'Live Price', route: 'heatmap',  dot: 'var(--warning)' },
  { id: 'arena',    label: 'Arena FO',   route: 'arena',    dot: 'var(--danger)' },
  { id: 'analyzer', label: 'Analyzer',   route: 'analyzer', dot: '#6366f1' },
];

const SHOWCASE_LIVE = [
  { t: 'BBCA', p: 9875, c: 1.8 },
  { t: 'TLKM', p: 2890, c: -0.7 },
  { t: 'ANTM', p: 1545, c: 2.4 },
  { t: 'GOTO', p: 64,   c: -1.5 },
];
const SHOWCASE_BIDS = [{ px: 1545, lot: 1200 }, { px: 1540, lot: 860 }, { px: 1535, lot: 540 }];
const SHOWCASE_ASKS = [{ px: 1550, lot: 980 }, { px: 1555, lot: 1340 }, { px: 1560, lot: 720 }];
const SHOWCASE_AVG_TARGET = 4350;

function ShowcasePanel({ tab, count }) {
  if (tab === 'calc') {
    return (
      <div className="pshow-rows">
        <div className="pshow-line"><span>Beli #1</span><span className="mono tnum">4.500 × 10 lot</span></div>
        <div className="pshow-line"><span>Beli #2</span><span className="mono tnum">4.200 × 10 lot</span></div>
        <div className="pshow-divider" />
        <div className="pshow-result">
          <span className="pshow-result-lbl">Harga rata-rata</span>
          <span className="mono tnum pshow-result-val">Rp {count.toLocaleString('id-ID')}</span>
        </div>
        <div className="pshow-badge pshow-badge-up mono tnum">Floating +3,4% ▲</div>
      </div>
    );
  }
  if (tab === 'live') {
    return (
      <div className="pshow-rows">
        {SHOWCASE_LIVE.map((r) => {
          const up = r.c >= 0;
          return (
            <div key={r.t} className="pshow-live-row">
              <span className="pshow-tk mono">{r.t}</span>
              <span className="mono tnum pshow-live-px">{r.p.toLocaleString('id-ID')}</span>
              <span className={`pshow-chip mono tnum ${up ? 'pshow-chip-up' : 'pshow-chip-dn'}`}>
                {up ? '+' : ''}{r.c.toFixed(1)}% {up ? '▲' : '▼'}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  if (tab === 'arena') {
    const maxLot = 1340;
    return (
      <div className="pshow-book">
        {SHOWCASE_ASKS.slice().reverse().map((a) => (
          <div key={a.px} className="pshow-book-row">
            <span className="mono tnum pshow-book-lot">{a.lot.toLocaleString('id-ID')}</span>
            <div className="pshow-book-track"><div className="pshow-book-bar pshow-bar-sell" style={{ width: `${(a.lot / maxLot) * 100}%` }} /></div>
            <span className="mono tnum pshow-book-px pshow-px-sell">{a.px}</span>
          </div>
        ))}
        <div className="pshow-book-mid mono tnum">spread 5 · last 1.548 ▲</div>
        {SHOWCASE_BIDS.map((b) => (
          <div key={b.px} className="pshow-book-row">
            <span className="mono tnum pshow-book-lot">{b.lot.toLocaleString('id-ID')}</span>
            <div className="pshow-book-track"><div className="pshow-book-bar pshow-bar-buy" style={{ width: `${(b.lot / maxLot) * 100}%` }} /></div>
            <span className="mono tnum pshow-book-px pshow-px-buy">{b.px}</span>
          </div>
        ))}
      </div>
    );
  }
  // analyzer
  return (
    <div className="pshow-rows">
      <div className="pshow-signal">
        <span className="pshow-signal-tag">SINYAL</span>
        <span className="pshow-signal-val">BUY</span>
        <span className="mono tnum pshow-signal-score">skor {count > 72 ? 72 : count}/100</span>
      </div>
      <div className="pshow-gauge"><div className="pshow-gauge-fill" style={{ width: `${(count > 72 ? 72 : count)}%` }} /></div>
      <div className="pshow-line"><span>Net asing</span><span className="mono tnum pshow-up">+Rp 4,2 M ▲</span></div>
      <div className="pshow-line"><span>Akumulasi 5 hari</span><span className="mono tnum pshow-up">+12,8% ▲</span></div>
    </div>
  );
}

function ProductShowcase({ onNavigate }) {
  const [active, setActive] = useStateL(0);
  const [count, setCount] = useStateL(0);
  const [inView, setInView] = useStateL(false);
  const [paused, setPaused] = useStateL(false);
  const ref = React.useRef(null);

  const onTabKey = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    setPaused(true);
    const n = SHOWCASE_TABS.length;
    setActive((a) => (e.key === 'ArrowRight' ? (a + 1) % n : (a - 1 + n) % n));
  };
  const reduce = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reveal on scroll
  useEffectL(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setInView(true); });
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Auto-advance tabs once visible (skip when reduced motion)
  useEffectL(() => {
    if (!inView || reduce || paused) return;
    const id = setInterval(() => setActive((a) => (a + 1) % SHOWCASE_TABS.length), 2500);
    return () => clearInterval(id);
  }, [inView, reduce, paused]);

  // Count-up target depends on active panel
  useEffectL(() => {
    const target = SHOWCASE_TABS[active].id === 'calc' ? SHOWCASE_AVG_TARGET
      : SHOWCASE_TABS[active].id === 'analyzer' ? 72 : 0;
    if (!target) { setCount(0); return; }
    if (reduce) { setCount(target); return; }
    let raf, start;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / 700);
      setCount(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, reduce]);

  const tab = SHOWCASE_TABS[active];

  return (
    <section className="pshow-section" ref={ref}>
      <div className="container">
        <div className={`pshow-head ${inView ? 'pshow-in' : ''}`}>
          <div className="badge" style={{ marginBottom: 14 }}>
            <Icon name="chart" size={12} />
            <span>LIHAT LANGSUNG · DEMO</span>
          </div>
          <h2 className="pshow-title">Semua alat, <span style={{ color: 'var(--primary)' }}>satu layar.</span></h2>
          <p className="pshow-sub">Kalkulator, harga live, simulasi Arena FO, sampai Analyzer — gerak beneran, bukan screenshot.</p>
        </div>

        <div
          className={`pshow-frame ${inView ? 'pshow-in' : ''}`}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
        >
          <div className="pshow-tabs" role="tablist" aria-label="Demo fitur Sahamath">
            {SHOWCASE_TABS.map((t, i) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`pshow-tab-${t.id}`}
                aria-selected={i === active}
                aria-controls="pshow-tabpanel"
                tabIndex={i === active ? 0 : -1}
                className={`pshow-tab ${i === active ? 'pshow-tab-active' : ''}`}
                onClick={() => { setPaused(true); setActive(i); }}
                onKeyDown={onTabKey}
              >
                <span className="pshow-tab-dot" style={{ background: t.dot }} aria-hidden="true" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="pshow-screen">
            <div
              key={active}
              className="pshow-panel"
              role="tabpanel"
              id="pshow-tabpanel"
              aria-labelledby={`pshow-tab-${tab.id}`}
              tabIndex={0}
            >
              <ShowcasePanel tab={tab.id} count={count} />
            </div>
          </div>

          <div className="pshow-foot">
            <div className="pshow-progress">
              {SHOWCASE_TABS.map((t, i) => (
                <span key={t.id} className={`pshow-pip ${i === active ? 'pshow-pip-on' : ''}`} />
              ))}
            </div>
            <button type="button" className="btn btn-primary pshow-cta" onClick={() => onNavigate && onNavigate(tab.route)}>
              Buka {tab.label} →
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .pshow-section { padding: 72px 0; }
        .pshow-head { max-width: 640px; margin: 0 auto; text-align: center; opacity: 0; transform: translateY(16px); transition: opacity .5s ease, transform .5s ease; }
        .pshow-head.pshow-in { opacity: 1; transform: none; }
        .pshow-title { font-size: clamp(28px, 4vw, 42px); letter-spacing: -0.025em; margin: 0 0 10px; }
        .pshow-sub { font-size: 16px; color: var(--fg-muted); margin: 0 0 28px; line-height: 1.5; }
        .pshow-frame {
          max-width: 540px; margin: 0 auto; background: var(--surface); border: 1px solid var(--border);
          border-radius: 20px; overflow: hidden; box-shadow: 0 24px 60px -24px rgba(0,0,0,0.35);
          opacity: 0; transform: translateY(28px) scale(0.98); transition: opacity .6s ease, transform .6s ease;
        }
        .pshow-frame.pshow-in { opacity: 1; transform: none; }
        .pshow-tabs { display: flex; gap: 4px; padding: 10px; background: var(--surface-2); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
        .pshow-tab {
          display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px; border-radius: 10px;
          font-size: 13px; font-weight: 700; color: var(--fg-muted); background: transparent; cursor: pointer;
          border: 1px solid transparent;
          transition-property: background-color, color, border-color; transition-duration: 180ms; transition-timing-function: ease-out;
        }
        .pshow-tab:hover { color: var(--fg); }
        .pshow-tab-active { background: var(--surface); color: var(--fg); border-color: var(--border); }
        .pshow-tab-dot { width: 8px; height: 8px; border-radius: 50%; }
        .pshow-screen { padding: 24px; min-height: 232px; display: flex; align-items: stretch; }
        .pshow-panel { width: 100%; animation: pshowPanel .45s cubic-bezier(0.22,1,0.36,1); }
        @keyframes pshowPanel { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        .pshow-rows { display: flex; flex-direction: column; gap: 12px; width: 100%; }
        .pshow-line { display: flex; justify-content: space-between; align-items: center; font-size: 14px; color: var(--fg-muted); }
        .pshow-divider { height: 1px; background: var(--border); margin: 2px 0; }
        .pshow-result { display: flex; justify-content: space-between; align-items: baseline; }
        .pshow-result-lbl { font-size: 13px; font-weight: 700; color: var(--fg-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .pshow-result-val { font-size: 26px; font-weight: 800; color: var(--fg); }
        .pshow-badge { align-self: flex-start; padding: 5px 12px; border-radius: 999px; font-size: 13px; font-weight: 800; }
        .pshow-badge-up { background: color-mix(in oklab, var(--success) 16%, transparent); color: var(--success); }
        .pshow-live-row { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
        .pshow-live-row:last-child { border-bottom: 0; }
        .pshow-tk { font-weight: 800; font-size: 15px; color: var(--fg); }
        .pshow-live-px { font-size: 15px; font-weight: 700; color: var(--fg); }
        .pshow-chip { padding: 3px 9px; border-radius: 7px; font-size: 12px; font-weight: 800; animation: pshowPulse 2.4s ease-in-out infinite; }
        .pshow-chip-up { background: color-mix(in oklab, var(--success) 15%, transparent); color: var(--success); }
        .pshow-chip-dn { background: color-mix(in oklab, var(--danger) 15%, transparent); color: var(--danger); }
        @keyframes pshowPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
        .pshow-book { display: flex; flex-direction: column; gap: 5px; width: 100%; }
        .pshow-book-row { display: grid; grid-template-columns: 64px 1fr 56px; gap: 10px; align-items: center; }
        .pshow-book-lot { font-size: 12px; color: var(--fg-muted); text-align: right; }
        .pshow-book-track { height: 18px; background: var(--surface-2); border-radius: 5px; overflow: hidden; }
        .pshow-book-bar { height: 100%; border-radius: 5px; transform-origin: left; animation: pshowBar .6s cubic-bezier(0.22,1,0.36,1); }
        @keyframes pshowBar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .pshow-bar-buy { background: color-mix(in oklab, var(--success) 55%, transparent); }
        .pshow-bar-sell { background: color-mix(in oklab, var(--danger) 55%, transparent); }
        .pshow-book-px { font-size: 13px; font-weight: 700; }
        .pshow-px-buy { color: var(--success); }
        .pshow-px-sell { color: var(--danger); }
        .pshow-book-mid { text-align: center; font-size: 11px; color: var(--fg-faint); padding: 4px 0; letter-spacing: 0.04em; }
        .pshow-signal { display: flex; align-items: baseline; gap: 12px; }
        .pshow-signal-tag { font-size: 11px; font-weight: 800; color: var(--fg-faint); letter-spacing: 0.08em; }
        .pshow-signal-val { font-size: 30px; font-weight: 900; color: var(--success); }
        .pshow-signal-score { font-size: 13px; color: var(--fg-muted); margin-left: auto; }
        .pshow-gauge { height: 10px; background: var(--surface-2); border-radius: 999px; overflow: hidden; }
        .pshow-gauge-fill { height: 100%; background: linear-gradient(90deg, var(--warning), var(--success)); border-radius: 999px; transition: width .2s linear; }
        .pshow-up { color: var(--success); font-weight: 700; }
        .pshow-foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 16px; border-top: 1px solid var(--border); background: var(--surface-2); }
        .pshow-progress { display: flex; gap: 6px; }
        .pshow-pip { width: 22px; height: 4px; border-radius: 999px; background: var(--border); transition: background-color .3s ease; }
        .pshow-pip-on { background: var(--primary); }
        .pshow-cta { font-size: 14px; font-weight: 700; padding: 9px 18px; }
        @media (max-width: 600px) { .pshow-foot { flex-direction: column; align-items: stretch; } .pshow-cta { width: 100%; } }
        @media (prefers-reduced-motion: reduce) {
          .pshow-head, .pshow-frame { opacity: 1 !important; transform: none !important; transition: none; }
          .pshow-panel, .pshow-book-bar, .pshow-chip { animation: none !important; }
        }
      `}</style>
    </section>
  );
}

/* ---------- IpoNewsWidget — feed berita IPO BEI (Google News) ---------- */
function IpoNewsWidget() {
  const [data, setDataIpo] = useStateL(null);
  const [err, setErrIpo] = useStateL(false);

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
    if (/closed|selesai|pencatatan|listing/.test(s)) return 'var(--fg-muted)';
    return 'var(--primary)';
  };
  const isRssAlert = data.source === 'rss';

  return (
    <section className="ipo-sec" style={{ padding: '64px 0' }}>
      <div className="container">
        <div style={{ marginBottom: 24, maxWidth: 640 }}>
          <div className="badge" style={{ marginBottom: 12 }}>
            <Icon name="chart" size={12} />
            <span>{isRssAlert ? 'PASAR PRIMER - ALERT IPO' : 'PASAR PRIMER - KALENDER IPO'}</span>
          </div>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', letterSpacing: '-0.025em', marginBottom: 8 }}>
            IPO di <span style={{ color: 'var(--primary)' }}>BEI</span>.
          </h2>
          <p style={{ fontSize: 15, color: 'var(--fg-muted)', margin: 0 }}>
            {isRssAlert
              ? 'Pantauan berita IPO terbaru dari RSS. Anggap sebagai alert awal, lalu verifikasi prospektus/e-IPO.'
              : 'Jadwal book building, penawaran, dan pencatatan emiten baru dari data curated e-IPO.'}
          </p>
        </div>

        <div className="ipo-grid">
          {data.items.map((it) => {
            const sc = stageColor(it.stage);
            const shortLbl = (l) => (l || '').replace(/\s*(book building|penawaran umum|penawaran)\s*/ig, ' ').replace(/\s+/g, ' ').trim();
            const meta = [it.sector, it.lot].filter(Boolean).join(' - ');
            return (
              <div key={it.id} className={`card interactive ipo-card${it.closed ? ' ipo-closed' : ''}`}>
                <div className="ipo-top">
                  <div className="ipo-logo-box">
                    {it.logo ? <img src={it.logo} alt={it.code} loading="lazy" /> : <Icon name="chart" size={22} />}
                  </div>
                  <span className="ipo-tag" style={{ color: sc, background: `color-mix(in oklab, ${sc} 14%, transparent)` }}>
                    {it.unverified ? 'RSS ALERT' : (it.stage || 'IPO').toUpperCase()}
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
        .ipo-tag { font-size: 10px; font-weight: 800; letter-spacing: 0.08em; padding: 4px 8px; border-radius: 6px; white-space: nowrap; }
        .ipo-name { font-size: 18px; margin: 0; letter-spacing: -0.02em; line-height: 1.25; min-height: 2.3em; }
        .ipo-idline { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
        .ipo-code { font-size: 12px; font-weight: 800; color: var(--fg-muted); }
        .ipo-syariah { font-size: 10px; font-weight: 800; color: #fff; background: var(--success); padding: 2px 8px; border-radius: 5px; }
        .ipo-hero { background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
        .ipo-hero-label { font-size: 10px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; color: var(--fg-muted); }
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
      <ProductShowcase onNavigate={onNavigate} />
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
