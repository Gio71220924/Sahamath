/* ============================================================
   components.jsx — Shared CuanMeter UI primitives.
   Exposes globals: fmt, Icon, CoinLogo, Header, Footer,
                    Sparkline, AnimatedNumber.
   ============================================================ */

const { useState, useEffect, useMemo, useRef, useCallback } = React;

/* ---------- formatters ---------- */
const fmt = {
  rp: (n, opts = {}) => {
    if (!isFinite(n)) return 'Rp 0';
    const sign = n < 0 ? '-' : '';
    const a = Math.abs(n);
    return sign + 'Rp ' + a.toLocaleString('id-ID', {
      maximumFractionDigits: opts.dec ?? 0,
    });
  },
  num: (n, dec = 0) =>
    isFinite(n)
      ? n.toLocaleString('id-ID', { maximumFractionDigits: dec, minimumFractionDigits: dec })
      : '0',
  pct: (n, dec = 2) =>
    isFinite(n) ? (n >= 0 ? '+' : '') + n.toFixed(dec) + '%' : '0%',
  compact: (n) => {
    if (!isFinite(n)) return '0';
    const a = Math.abs(n);
    if (a >= 1e12) return (n / 1e12).toFixed(2) + ' T';
    if (a >= 1e9)  return (n / 1e9).toFixed(2) + ' M';
    if (a >= 1e6)  return (n / 1e6).toFixed(2) + ' Jt';
    if (a >= 1e3)  return (n / 1e3).toFixed(1) + ' rb';
    return n.toFixed(0);
  },
};

/* ---------- Icon ---------- */
const ICON_PATHS = {
  coin: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9c0-1.5 1-2 2.5-2s2.5.5 2.5 2c0 1.2-1 1.7-2.5 2s-2.5.8-2.5 2c0 1.5 1 2 2.5 2s2.5-.5 2.5-2"/><path d="M12 6v1"/><path d="M12 17v1"/></>,
  calc: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/></>,
  chart: <><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></>,
  zap: <><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></>,
  shield: <><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/></>,
  wallet: <><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 01-2-2 2 2 0 012-2h14"/><circle cx="17" cy="13" r="1.2" fill="currentColor"/></>,
  arrows: <><path d="M7 17l-4-4 4-4"/><path d="M3 13h18"/><path d="M17 7l4 4-4 4"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></>,
  candle: <><path d="M6 4v4M6 16v4M6 8h0a2 2 0 012 2v4a2 2 0 01-2 2h0a2 2 0 01-2-2v-4a2 2 0 012-2z" fill="currentColor"/><path d="M14 2v6M14 16v6"/><rect x="12" y="8" width="4" height="8" rx="1" fill="currentColor"/></>,
  bookmark: <><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z"/></>,
  book: <><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
  moon: <><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></>,
  arrow_right: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  arrow_left: <><path d="M19 12H5M11 18l-6-6 6-6"/></>,
  flash: <><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor"/></>,
  check: <><path d="M20 6L9 17l-5-5"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  minus: <><path d="M5 12h14"/></>,
  trash: <><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 8v.01M11 12h1v4h1"/></>,
  menu: <><path d="M3 6h18M3 12h18M3 18h18"/></>,
  x: <><path d="M18 6L6 18M6 6l12 12"/></>,
  fire: <><path d="M12 2c1 6 5 7 5 12a5 5 0 11-10 0c0-2 1-3 1-5 0 0 2 1 3 0-1-3 0-5 1-7z"/></>,
  rocket: <><path d="M14 6l4 4-9 9-4 1 1-4 8-10z"/><path d="M14 6c2-2 5-2 6 0s0 4-2 6"/><path d="M9 15l-3-3"/></>,
  diamond: <><path d="M6 4h12l4 6-10 12L2 10z"/><path d="M6 4l4 6h4l4-6"/><path d="M2 10h20"/></>,
  bolt: <><path d="M11 3L4 14h7l-1 7 9-12h-7l1-6z"/></>,
  star: <><path d="M12 2l3 7 7 .8-5 5 1.5 7L12 18l-6.5 3.8L7 14l-5-5L9 8z"/></>,
  spark: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></>,
};

function Icon({ name, size = 20, stroke = 2 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[name] || ICON_PATHS.info}
    </svg>
  );
}

/* ---------- SahamathLogo ---------- */
function SahamathLogo({ size = 20 }) {
  const lineH = Math.max(5, Math.round(size * 0.32));
  return (
    <span style={{ fontWeight: 900, fontSize: size, letterSpacing: '-0.03em', lineHeight: 1, userSelect: 'none' }}>
      <span style={{ color: 'var(--fg)' }}>Saha</span>
      <span className="logo-math" style={{ display: 'inline-block', position: 'relative', color: 'var(--primary)', paddingBottom: lineH + 1 }}>
        math
        <svg
          viewBox="0 0 48 8"
          preserveAspectRatio="none"
          style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: lineH, display: 'block' }}
        >
          <polyline
            className="logo-sparkline"
            points="0,7 4,6 10,7 16,4 22,5 28,2 34,3 40,1 48,2"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </span>
  );
}

/* ---------- CoinLogo — candlestick chart ---------- */
function CoinLogo({ size = 36 }) {
  const r = Math.round(size * 0.22);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
      <rect width="64" height="64" rx={r} fill="#007f55"/>
      <line x1="13" y1="40" x2="13" y2="60" stroke="white" strokeWidth="2.2" strokeLinecap="round" opacity=".7"/>
      <rect x="8" y="46" width="10" height="10" rx="2" fill="white"/>
      <line x1="32" y1="25" x2="32" y2="58" stroke="white" strokeWidth="2.2" strokeLinecap="round" opacity=".7"/>
      <rect x="27" y="31" width="10" height="22" rx="2" fill="white"/>
      <line x1="51" y1="12" x2="51" y2="52" stroke="white" strokeWidth="2.2" strokeLinecap="round" opacity=".7"/>
      <rect x="46" y="18" width="10" height="28" rx="2" fill="white"/>
      <polyline points="47,12 51,7 55,12" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ---------- Isometric 3D icons (menu Kalkulator & Simulasi) ---------- */
// Kotak & koin isometrik, 3 nada per material (atas terang, kiri sedang, kanan gelap).
// Warna dari uang rupiah. viewBox 120x100, titik asal (60, 60).
const ISO_ICONS = (() => {
  const C = 0.866, S = 0.5, OX = 60, OY = 60;
  const pt = (x, y, z) => `${(OX + (x - y) * C).toFixed(1)} ${(OY + (x + y) * S - z).toFixed(1)}`;
  const poly = (pts) => 'M' + pts.join(' L') + ' Z';
  const box = (x, y, z, w, d, h, t) => [
    { d: poly([pt(x, y + d, z), pt(x + w, y + d, z), pt(x + w, y + d, z + h), pt(x, y + d, z + h)]), f: t[1] },
    { d: poly([pt(x + w, y, z), pt(x + w, y + d, z), pt(x + w, y + d, z + h), pt(x + w, y, z + h)]), f: t[2] },
    { d: poly([pt(x, y, z + h), pt(x + w, y, z + h), pt(x + w, y + d, z + h), pt(x, y + d, z + h)]), f: t[0] },
  ];
  const coin = (cx, cy, r, h, t) => {
    const rx = 1.2247 * r, ry = 0.7071 * r;
    const ell = (a, b) => `M${cx - a} ${cy} A${a} ${b} 0 1 0 ${cx + a} ${cy} A${a} ${b} 0 1 0 ${cx - a} ${cy} Z`;
    return [
      { d: `M${cx - rx} ${cy} L${cx - rx} ${cy + h} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy + h} L${cx + rx} ${cy} Z`, f: t[2] },
      { d: ell(rx, ry), f: t[0] },
      { d: ell(rx * 0.72, ry * 0.72), f: t[1] },
      { d: ell(rx * 0.62, ry * 0.62), f: t[0] },
    ];
  };
  const gold = ['#e8c96b', '#c9a43f', '#97741f'];
  const green = ['#6bb98f', '#2f8a5b', '#1d6542'];
  const red = ['#e27c84', '#c0414b', '#8f2c36'];
  const blue = ['#86a6da', '#3e66b0', '#294a86'];
  const purple = ['#ad95d6', '#7a5cad', '#573f83'];
  const paper = ['#e6e9e3', '#c4c9c2', '#9aa099']; // abu muda: lembar putih hilang di dropdown putih
  const flat = (arr) => [].concat(...arr);
  return {
    average: flat([box(-30, -6, 0, 14, 14, 18, blue), box(-10, -6, 0, 14, 14, 34, blue), box(10, -6, 0, 14, 14, 26, blue)]),
    araarb: flat([box(-20, -4, 0, 16, 16, 46, green), box(8, -4, 0, 16, 16, 14, red)]),
    profit: flat([coin(60, 70, 24, 9, gold), coin(60, 56, 24, 9, gold), coin(60, 42, 24, 9, gold)]),
    amunisi: flat([box(-18, -14, 0, 36, 28, 9, paper), box(-18, -14, 11, 36, 28, 9, blue), box(-18, -14, 22, 36, 28, 9, green)]),
    dividen: flat([box(-24, -24, 0, 48, 48, 7, purple), coin(60, 45, 18, 8, gold)]),
    papertrade: flat([box(-22, -16, 0, 40, 30, 3, paper), box(-18, -20, 5, 40, 30, 3, paper), box(-14, -24, 10, 40, 30, 3, paper), coin(72, 40, 9, 5, gold)]),
    arena: flat([
      box(-30, -10, 0, 12, 12, 30, red), box(-30, 4, 0, 12, 12, 20, red), box(-30, 18, 0, 12, 12, 10, red),
      box(-12, -28, 0, 12, 12, 10, green), box(2, -28, 0, 12, 12, 20, green), box(16, -28, 0, 12, 12, 30, green),
    ]),
    analyzer: flat([box(-24, -6, 8, 12, 12, 30, green), box(-6, -6, 4, 12, 12, 18, red), box(12, -6, 12, 12, 12, 38, green)]),
    heatmap: flat([
      box(-27, -27, 0, 16, 16, 12, green), box(-9, -27, 0, 16, 16, 6, red), box(9, -27, 0, 16, 16, 18, green),
      box(-27, -9, 0, 16, 16, 5, red), box(-9, -9, 0, 16, 16, 22, green), box(9, -9, 0, 16, 16, 8, red),
      box(-27, 9, 0, 16, 16, 15, green), box(-9, 9, 0, 16, 16, 4, red), box(9, 9, 0, 16, 16, 10, green),
    ]),
    profilrisiko: flat([box(-24, -24, 0, 48, 48, 9, green), box(-17, -17, 10, 34, 34, 9, ['#f0c98a', '#d39a3c', '#a8732a']), box(-10, -10, 20, 20, 20, 9, red)]),
  };
})();

/* ---------- Nota (struk) primitives — dipakai Analyzer & Landing ---------- */
// Warna uang rupiah: hijau Rp20rb naik, merah Rp100rb turun, biru Rp50rb kisaran.
// Kertas struk tetap terang di dark mode: itu kertas.
const NOTA_INK = '#191b1a';
const NOTA_UP = '#1f7a4d';
const NOTA_DOWN = '#b8323c';
const NOTA_INFO = '#2b57a6';

function NotaEdge({ bottom }) {
  let d = bottom ? 'M0 0' : 'M0 10';
  for (let i = 0; i < 34; i++) d += bottom ? ` L${i * 10 + 5} 10 L${i * 10 + 10} 0` : ` L${i * 10 + 5} 0 L${i * 10 + 10} 10`;
  return (
    <svg aria-hidden="true" viewBox="0 0 340 10" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 10 }}>
      <path d={d + ' Z'} fill="#fcfcfa" />
    </svg>
  );
}

function NotaRow({ k, v, c }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span>{k}</span><span style={{ color: c || NOTA_INK }}>{v}</span>
    </div>
  );
}

function NotaCut() {
  return <div aria-hidden="true" style={{ borderTop: '1.5px dashed #9ca19b', margin: '10px 0' }} />;
}

// Fee broker pengguna (persen), diatur di kalkulator Profit dan dipakai Hero + paper trade.
const FEE_DEFAULT = { buy: 0.15, sell: 0.25 };
function getFees() {
  try { return { ...FEE_DEFAULT, ...JSON.parse(localStorage.getItem('sahamath-fee')) }; } catch { return FEE_DEFAULT; }
}
function saveFees(fees) {
  try { localStorage.setItem('sahamath-fee', JSON.stringify(fees)); } catch {}
}

// Judul bagian landing: garis tebal di atas, kalimat biasa, tanpa badge.
function SectionTitle({ title, sub, aside }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, paddingTop: 24, borderTop: '2px solid var(--fg)', marginBottom: 24 }}>
      <div style={{ maxWidth: 640 }}>
        <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', letterSpacing: '-0.03em' }}>{title}</h2>
        {sub && <p style={{ margin: '10px 0 0', fontSize: 16, lineHeight: 1.5, color: 'var(--fg-muted)' }}>{sub}</p>}
      </div>
      {aside}
    </div>
  );
}

function IsoIcon({ name, size = 36 }) {
  const shapes = ISO_ICONS[name];
  if (!shapes) return null;
  return (
    <svg aria-hidden="true" viewBox="0 0 120 100" width={size} height={Math.round(size * 100 / 120)} style={{ flexShrink: 0 }}>
      {shapes.map((s, i) => <path key={i} d={s.d} fill={s.f} />)}
    </svg>
  );
}

/* ---------- Header (sticky + mobile menu) ---------- */
// Grouped navigation: 10 flat links collapsed into 3 dropdown groups + 1
// standalone link, so the top bar reads as 4 items instead of ten.
const NAV_GROUPS = [
  {
    label: 'Kalkulator',
    items: [
      { id: 'average', label: 'Rata-rata' },
      { id: 'araarb',  label: 'ARA/ARB' },
      { id: 'profit',  label: 'Profit' },
      { id: 'amunisi', label: 'Amunisi' },
      { id: 'dividen', label: 'Dividen' },
    ],
  },
  {
    label: 'Analisa',
    items: [
      { id: 'analyzer', label: 'Analyzer' },
      { id: 'heatmap',  label: 'Heatmap' },
      { id: 'profilrisiko', label: 'Profil Risiko' },
    ],
  },
  {
    label: 'Simulasi',
    items: [
      { id: 'papertrade', label: 'Paper Trade' },
      { id: 'arena',      label: 'Arena FO' },
    ],
  },
  { label: 'Panduan', id: 'guides' },
];

function Header({ route, onNavigate, theme, onThemeChange }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);

  const groupIsActive = (group) => (
    Array.isArray(group.items) && group.items.some((item) => item.id === route)
  );

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const headerStyle = {
    position: 'sticky',
    top: 0,
    zIndex: 40,
    backdropFilter: scrolled ? 'blur(24px) saturate(160%)' : 'none',
    WebkitBackdropFilter: scrolled ? 'blur(24px) saturate(160%)' : 'none',
    background: scrolled ? 'color-mix(in oklab, var(--bg) 80%, transparent)' : 'transparent',
    borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent',
    transition: 'all 0.3s ease',
  };

  return (
    <header style={headerStyle}>
      <div
        className="container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 72,
        }}
      >
        <button
          onClick={() => onNavigate('home')}
          aria-label="Sahamath — ke halaman utama"
          className="logo-btn"
          style={{ display: 'flex', alignItems: 'center', gap: 12 }}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width - 0.5) * 10;
            const y = ((e.clientY - r.top) / r.height - 0.5) * 10;
            e.currentTarget.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
          }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}
        >
          <SahamathLogo size={22} />
        </button>

        <nav
          className="nav-desktop"
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          {NAV_GROUPS.map((group) => (
            group.items ? (
              <div
                key={group.label}
                className="nav-group"
                onMouseEnter={() => setOpenGroup(group.label)}
                onMouseLeave={() => setOpenGroup((cur) => (cur === group.label ? null : cur))}
              >
                <button
                  type="button"
                  className={`nav-link nav-group-btn${groupIsActive(group) ? ' nav-link--active' : ''}`}
                  onClick={() => setOpenGroup(group.label)}
                  aria-haspopup="true"
                  aria-expanded={openGroup === group.label}
                >
                  {group.label}
                  <span className={`nav-caret${openGroup === group.label ? ' nav-caret--open' : ''}`} aria-hidden="true">▾</span>
                </button>
                {openGroup === group.label && (
                  <div className="nav-dropdown" role="menu">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        role="menuitem"
                        onClick={() => { onNavigate(item.id); setOpenGroup(null); }}
                        className={`nav-dropdown-item${route === item.id ? ' nav-dropdown-item--active' : ''}`}
                      >
                        <IsoIcon name={item.id} size={34} />
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                key={group.id}
                onClick={() => onNavigate(group.id)}
                className={`nav-link${route === group.id ? ' nav-link--active' : ''}`}
              >
                {group.label}
              </button>
            )
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => onThemeChange(theme === 'dark' ? 'fintech' : 'dark')}
            title="Toggle dark"
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--fg)',
            }}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onNavigate('average')}
            style={{ height: 40, padding: '0 18px', fontSize: 13 }}
          >
            Mulai Hitung
          </button>
          <button
            type="button"
            aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'}
            onClick={() => setMenuOpen(!menuOpen)}
            className="nav-mobile"
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius)',
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--fg)',
            }}
          >
            <Icon name={menuOpen ? 'x' : 'menu'} size={18} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          className="nav-mobile-menu"
          style={{
            padding: '12px 16px 20px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {NAV_GROUPS.map((group) => {
            const links = group.items || [{ id: group.id, label: group.label }];
            return (
              <div key={group.label} style={{ marginBottom: group.items ? 10 : 0 }}>
                {group.items && (
                  <div style={{
                    padding: '10px 16px 4px',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--fg-faint)',
                  }}>
                    {group.label}
                  </div>
                )}
                {links.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => { onNavigate(l.id); setMenuOpen(false); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      padding: '10px 16px',
                      textAlign: 'left',
                      fontSize: 16,
                      fontWeight: 600,
                      color: route === l.id ? 'var(--primary)' : 'var(--fg)',
                      borderRadius: 'var(--radius)',
                      background: route === l.id ? 'var(--primary-soft)' : 'transparent',
                    }}
                  >
                    <IsoIcon name={l.id} size={34} />
                    {l.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .logo-btn {
          transition: transform 0.35s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .logo-sparkline {
          stroke-dasharray: 55;
          stroke-dashoffset: 55;
          transition: stroke-dashoffset 0.65s ease;
        }
        .logo-btn:hover .logo-sparkline {
          stroke-dashoffset: 0;
        }
        .logo-btn:hover .logo-math {
          text-shadow: 0 0 12px rgba(0,168,107,0.55), 0 0 28px rgba(0,168,107,0.25);
        }
        .logo-math {
          transition: text-shadow 0.25s;
        }
        .nav-link {
          padding: 10px 16px;
          font-size: 14px;
          font-weight: 600;
          color: var(--fg-muted);
          border-radius: var(--radius);
          background: transparent;
          transition: color 0.15s, background 0.15s;
        }
        .nav-link:hover {
          color: var(--primary);
          background: var(--primary-soft);
        }
        .nav-link--active {
          color: var(--primary);
          background: var(--primary-soft);
        }
        .nav-group { position: relative; }
        .nav-group-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .nav-caret {
          font-size: 10px;
          line-height: 1;
          opacity: 0.7;
          transition: transform 0.18s ease;
        }
        .nav-caret--open { transform: rotate(180deg); }
        .nav-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          min-width: 180px;
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          z-index: 50;
          animation: navDropIn 0.16s ease;
        }
        /* Invisible bridge over the 6px gap so moving the cursor from the
           group button into the menu doesn't trigger mouse-leave. */
        .nav-dropdown::before {
          content: '';
          position: absolute;
          top: -8px;
          left: 0;
          right: 0;
          height: 8px;
        }
        @keyframes navDropIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .nav-dropdown-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 12px 6px 6px;
          text-align: left;
          font-size: 14px;
          font-weight: 600;
          color: var(--fg-muted);
          background: transparent;
          border-radius: calc(var(--radius) - 2px);
          transition: color 0.12s, background 0.12s;
        }
        .nav-dropdown-item:hover {
          color: var(--primary);
          background: var(--primary-soft);
        }
        .nav-dropdown-item--active {
          color: var(--primary);
          background: var(--primary-soft);
        }
        @media (max-width: 900px) {
          .nav-desktop { display: none !important; }
          .nav-mobile { display: flex !important; }
        }
      `}</style>
    </header>
  );
}

/* ---------- Footer ---------- */
function Footer({ onNavigate }) {
  const go = (id) => onNavigate && onNavigate(id);
  return (
    <footer
      style={{
        borderTop: '1px solid var(--border)',
        padding: '48px 0 32px',
        marginTop: 80,
        background: 'var(--bg-soft)',
      }}
    >
      <div
        className="container footer-grid"
        style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 40 }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <SahamathLogo size={22} />
          </div>
          <p
            style={{
              color: 'var(--fg-muted)',
              fontSize: 14,
              maxWidth: 360,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Kalkulator saham IDX gratis. Hitung rata-rata, ARA/ARB, profit, amunisi, dan
            dividen. Tanpa iklan.
          </p>
        </div>
        <div>
          <h2 style={footerHeadStyle}>Kalkulator</h2>
          <ul style={footerListStyle}>
            {[
              { label: 'Rata-rata', id: 'average' },
              { label: 'ARA/ARB',   id: 'araarb' },
              { label: 'Profit',    id: 'profit' },
              { label: 'Amunisi',   id: 'amunisi' },
              { label: 'Dividen',   id: 'dividen' },
              { label: 'Analyzer',  id: 'analyzer' },
            ].map(({ label, id }) => (
              <li key={id}>
                <button onClick={() => go(id)} className="footer-link">{label}</button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 style={footerHeadStyle}>Belajar</h2>
          <ul style={footerListStyle}>
            {[
              { label: 'Panduan', id: 'guides' },
            ].map(({ label, id }) => (
              <li key={label}>
                <button onClick={() => go(id)} className="footer-link">{label}</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div
        className="container"
        style={{
          marginTop: 40,
          paddingTop: 24,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--fg-faint)' }}>
          © 2026 Sahamath. Bukan ajakan beli atau jual.
        </span>
      </div>

      <style>{`
        @media (max-width: 760px) {
          footer .footer-grid { grid-template-columns: 1fr !important; gap: 28px !important; }
        }
        .footer-link {
          font-size: 14px; color: var(--fg); background: none; border: none;
          padding: 0; cursor: pointer; text-align: left;
          transition: color 0.15s;
        }
        .footer-link:hover { color: var(--primary); }
      `}</style>
    </footer>
  );
}

const footerHeadStyle = { fontSize: 14, marginBottom: 12, color: 'var(--fg-muted)' };

const footerListStyle = {
  padding: 0,
  margin: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const footerLinkStyle = { fontSize: 14, color: 'var(--fg)' };

/* ---------- Sparkline ---------- */
function Sparkline({ data, height = 36, color, fill = true }) {
  const w = 100;
  const h = height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y];
  });
  const d = pts
    .map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(2) + ',' + p[1].toFixed(2))
    .join(' ');
  const fillD = `${d} L ${w},${h} L 0,${h} Z`;
  const lineColor =
    color || (data[data.length - 1] >= data[0] ? 'var(--success)' : 'var(--danger)');
  const id = 'spark-' + Math.random().toString(36).slice(2, 8);

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ height }}
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={lineColor} stopOpacity="0.3" />
              <stop offset="1" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={fillD} fill={`url(#${id})`} />
        </>
      )}
      <path
        d={d}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ---------- AnimatedNumber ---------- */
function AnimatedNumber({
  value,
  duration = 600,
  format = (x) => x.toLocaleString('id-ID', { maximumFractionDigits: 0 }),
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef(0);

  useEffect(() => {
    // "kurangi gerakan" di sistem: langsung tampilkan angka akhir
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return undefined;
    }
    fromRef.current = display;
    startRef.current = performance.now();
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(cur);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{format(display)}</>;
}

Object.assign(window, {
  fmt,
  Icon,
  CoinLogo,
  Header,
  Footer,
  Sparkline,
  AnimatedNumber,
  IsoIcon,
  NotaEdge,
  NotaRow,
  NotaCut,
  SectionTitle,
  FEE_DEFAULT,
  getFees,
  saveFees,
  NOTA_INK,
  NOTA_UP,
  NOTA_DOWN,
  NOTA_INFO,
});
