/* ============================================================
   app.jsx — CuanMeter root.
   Wires up hash routing and theme state, mounts <App/> via
   ReactDOM.createRoot.
   ============================================================ */

const { useState: useStateA, useEffect: useEffectA, useRef: useRefA } = React;

const ROUTES = ['home', 'average', 'araarb', 'profit', 'amunisi', 'dividen', 'analyzer', 'heatmap', 'profilrisiko', 'papertrade', 'arena', 'guides'];

/* ---------- Floating IHSG ticker ---------- */
function IHSGFloater({ compact = false }) {
  const [data, setDataA] = useStateA(null);
  const esRef = useRefA(null);

  useEffectA(() => {
    // ponytail: SSE can't go through Netlify's redirect proxy — hit Railway directly (CORS is already *).
    const es = new EventSource('https://sahamath-production.up.railway.app/api/prices/stream');
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const prices = JSON.parse(e.data);
        const c = prices['IDX:COMPOSITE'];
        if (c && c.price) setDataA({ price: c.price, change_pct: c.pct, change_abs: c.change });
      } catch {}
    };
    return () => es.close();
  }, []);

  const up = data ? data.change_pct >= 0 : null;
  const color = up === null ? 'var(--fg-muted)' : up ? 'var(--success)' : 'var(--danger)';

  return (
    <div
      className={compact ? 'ihsg-floater ihsg-floater-arena' : 'ihsg-floater'}
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 900,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '10px 14px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        display: 'flex', alignItems: 'center', gap: 10,
        backdropFilter: 'blur(8px)',
        minWidth: 160,
      }}
    >
      <div style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: data ? color : 'var(--fg-faint)',
        boxShadow: data ? `0 0 6px ${color}` : 'none',
      }} />
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--fg-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 1 }}>
          IHSG
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span className="mono tnum" style={{ fontSize: 14, fontWeight: 800, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
            {data ? data.price.toLocaleString('id-ID') : '—'}
          </span>
          {data && (
            <span style={{ fontSize: 11, fontWeight: 700, color }}>
              {fmt.pct(data.change_pct)}
            </span>
          )}
        </div>
      </div>
      {data && (
        <div style={{ fontSize: 18, color, lineHeight: 1 }}>
          {up ? '▲' : '▼'}
        </div>
      )}
    </div>
  );
}

/* ---------- Bundle halaman (produksi) ----------
   app.bundle.js cuma berisi halaman depan; kalkulator, Analyzer, Panduan, dst. ada di
   pages.bundle.js (scripts/build-bundle.js PAGES_ORDER), dimuat setelah render pertama.
   Dev (Babel per file) sudah memuat semuanya, jadi langsung siap. */
const PAGES_BUNDLE = 'js/cuanmeter/pages.bundle.js';
const pagesLoaded = () => typeof window.AveragePrice === 'function';
let pagesPromise = null;

function loadPages() {
  if (pagesLoaded()) return Promise.resolve();
  if (!pagesPromise) {
    pagesPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PAGES_BUNDLE;
      s.onerror = () => { pagesPromise = null; s.remove(); reject(new Error('pages bundle')); };
      // Vercel membalas path yang tidak ada dengan index.html (200): onload terpanggil tanpa halaman
      s.onload = () => (pagesLoaded() ? resolve() : s.onerror());
      document.body.appendChild(s);
    });
  }
  return pagesPromise;
}

function PagesLoading({ failed, onRetry }) {
  return (
    <main className="container" style={{ minHeight: '60vh', padding: '48px 0' }}>
      {failed ? (
        <p role="alert" style={{ margin: 0, fontSize: 16, color: 'var(--fg-muted)' }}>
          Halaman belum bisa dimuat. Periksa koneksi, lalu{' '}
          <button type="button" onClick={onRetry} style={{ font: 'inherit', color: 'var(--fg)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            coba lagi
          </button>.
        </p>
      ) : (
        <p aria-live="polite" style={{ margin: 0, fontSize: 16, color: 'var(--fg-muted)' }}>Memuat halaman...</p>
      )}
    </main>
  );
}

function readRouteFromHash() {
  const h = window.location.hash.slice(1);
  return ROUTES.includes(h) ? h : 'home';
}

function App() {
  const [route, setRoute] = useStateA(readRouteFromHash);
  const [theme, setTheme] = useStateA('fintech');
  const [pendingTicker, setPendingTicker] = useStateA(null);
  const [pagesReady, setPagesReady] = useStateA(pagesLoaded);
  const [pagesFailed, setPagesFailed] = useStateA(false);

  const fetchPages = () => {
    setPagesFailed(false);
    loadPages().then(() => setPagesReady(true), () => setPagesFailed(true));
  };
  useEffectA(fetchPages, []); // langsung setelah render pertama, supaya klik menu tidak menunggu

  // Sync theme to <body data-theme="...">
  useEffectA(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  // Hash-based routing
  useEffectA(() => {
    const onHash = () => {
      setRoute(readRouteFromHash());
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (r, ticker) => {
    setPendingTicker(ticker || null);
    window.location.hash = r;
    setRoute(r);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const screen = (() => {
    if (route !== 'home' && !pagesReady) return <PagesLoading failed={pagesFailed} onRetry={fetchPages} />;
    switch (route) {
      case 'average':  return <AveragePrice />;
      case 'araarb':   return <ARAARB />;
      case 'profit':   return <ProfitCalc />;
      case 'amunisi':  return <Amunisi />;
      case 'dividen':  return <Dividen />;
      case 'analyzer': return <Analyzer initialTicker={pendingTicker} />;
      case 'heatmap':  return <HeatmapPage onNavigate={navigate} />;
      case 'profilrisiko': return <RiskPage />;
      case 'papertrade': return <PaperTradePage onNavigate={navigate} />;
      case 'arena':    return <ArenaPage onNavigate={navigate} />;
      case 'guides':   return <GuidesPage initialGuide={pendingTicker} />;
      default:         return <LandingPage onNavigate={navigate} />;
    }
  })();

  return (
    <div className="app-shell">
      <Header
        route={route}
        onNavigate={navigate}
        theme={theme}
        onThemeChange={setTheme}
      />
      <div key={route} className="fade-up" style={{ flex: 1 }}>
        {screen}
      </div>
      <Footer onNavigate={navigate} />
      <IHSGFloater compact={route === 'arena'} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
