/* ============================================================
   watchlist.jsx — localStorage store + ★ toggle.
   Persists the user's watchlist and keeps the Analyzer star and
   the home widget in sync via a tiny pub/sub.
   ============================================================ */

const { useState: useStateW, useEffect: useEffectW, useRef: useRefW } = React;

const WATCHLIST_KEY = 'cuanmeter:watchlist';
const wlListeners = new Set();

function getWatchlist() {
  try {
    const v = JSON.parse(localStorage.getItem(WATCHLIST_KEY));
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}
function setWatchlist(list) {
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list)); } catch (e) {}
  wlListeners.forEach((fn) => fn(list));
}
function hasTicker(t) { return getWatchlist().includes(String(t).toUpperCase()); }
function addTicker(t) {
  const code = String(t).toUpperCase().trim();
  if (!/^[A-Z]{4}$/.test(code)) return;
  const list = getWatchlist();
  if (!list.includes(code)) setWatchlist([...list, code]);
}
function removeTicker(t) {
  const code = String(t).toUpperCase();
  setWatchlist(getWatchlist().filter((x) => x !== code));
}
function toggleTicker(t) {
  hasTicker(t) ? removeTicker(t) : addTicker(t);
}
function subscribeWatchlist(fn) {
  wlListeners.add(fn);
  return () => wlListeners.delete(fn);
}

/* Hook: re-render on any watchlist change (same tab). */
function useWatchlist() {
  const [list, setList] = useStateW(getWatchlist);
  useEffectW(() => subscribeWatchlist(setList), []);
  return list;
}

/* ★ toggle button — used in the Analyzer header. */
function WatchlistStar({ ticker, size = 22 }) {
  const list = useWatchlist();
  if (!ticker) return null;
  const code = String(ticker).toUpperCase();
  const active = list.includes(code);
  return (
    <button
      type="button"
      className={`watchlist-star${active ? ' active' : ''}`}
      style={{ fontSize: size }}
      onClick={() => toggleTicker(code)}
      title={active ? 'Hapus dari watchlist' : 'Simpan ke watchlist'}
      aria-label={active ? 'Hapus dari watchlist' : 'Simpan ke watchlist'}
    >
      {active ? '★' : '☆'}
    </button>
  );
}

/* Mini 7-day sparkline. */
function Sparkline({ data, up }) {
  if (!data || data.length < 2) return null;
  const w = 64, h = 24, p = 2;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = p + (i / (data.length - 1)) * (w - p * 2);
    const y = p + (1 - (v - min) / range) * (h - p * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg className="watchlist-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={up ? 'var(--success)' : 'var(--danger)'} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* Search box with /search autocomplete → add to watchlist. */
function WatchlistSearch({ onPick }) {
  const [q, setQ] = useStateW('');
  const [results, setResults] = useStateW([]);
  const timer = useRefW(null);

  const onChange = (val) => {
    setQ(val);
    clearTimeout(timer.current);
    if (val.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(() => {
      fetch('/search?q=' + encodeURIComponent(val.trim()))
        .then((r) => r.json())
        .then((d) => setResults((d.results || []).slice(0, 6)))
        .catch(() => setResults([]));
    }, 250);
  };
  const choose = (sym) => { addTicker(sym); onPick && onPick(sym); setQ(''); setResults([]); };

  return (
    <div className="watchlist-search">
      <input
        className="watchlist-search-input"
        placeholder="+ Tambah saham (ketik kode atau nama)"
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && /^[A-Za-z]{4}$/.test(q.trim())) choose(q.trim().toUpperCase()); }}
      />
      {results.length > 0 && (
        <div className="watchlist-search-results">
          {results.map((s) => (
            <button type="button" key={s.symbol} className="watchlist-search-item" onClick={() => choose(s.symbol)}>
              <strong>{s.symbol}</strong> <span>{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Home widget: saved tickers with logo + sparkline + price + daily %. */
function WatchlistWidget({ onNavigate }) {
  const list = useWatchlist();
  const [quotes, setQuotes] = useStateW({});
  const [loading, setLoading] = useStateW(false);
  const key = list.join(',');

  useEffectW(() => {
    if (!list.length) { setQuotes({}); return; }
    let alive = true;
    setLoading(true);
    fetch('/watchlist?tickers=' + key)
      .then((r) => r.json())
      .then((d) => { if (alive) { setQuotes(d.quotes || {}); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [key]);

  return (
    <section className="watchlist-widget" style={{ padding: '80px 0' }}>
      <div className="container">
        <SectionTitle title="Saham pantauanmu" sub="Tersimpan di browser ini. Klik baris untuk analisis, atau ★ di Analyzer untuk menambah." />

        <WatchlistSearch />

        {list.length === 0 ? (
          <div className="watchlist-empty">
            Belum ada saham dipantau. Ketik kode di atas, atau klik ★ di halaman Analyzer.
          </div>
        ) : (
          <div className="watchlist-rows">
            {list.map((t) => {
              const q = quotes[t];
              const up = q ? q.pct >= 0 : true;
              const logo = window.logoSrcFor ? window.logoSrcFor(t) : null;
              return (
                <div key={t} className="watchlist-row"
                  onClick={() => onNavigate && onNavigate('analyzer', t)}>
                  {logo
                    ? <img className="watchlist-logo" src={logo} alt="" width={26} height={26} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                    : <span className="watchlist-logo watchlist-logo-fallback">{t.slice(0, 2)}</span>}
                  <span className="watchlist-tk">{t}</span>
                  <span className="watchlist-spark-wrap">{q && <Sparkline data={q.spark} up={up} />}</span>
                  <span className="watchlist-px">{q ? 'Rp ' + q.price.toLocaleString('id-ID') : (loading ? '…' : '—')}</span>
                  <span className={up ? 'watchlist-up' : 'watchlist-dn'}>{q ? (q.pct >= 0 ? '+' : '') + q.pct + '%' : ''}</span>
                  <button type="button" className="watchlist-remove" onClick={(e) => { e.stopPropagation(); removeTicker(t); }} aria-label="Hapus" title="Hapus dari watchlist">×</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

Object.assign(window, {
  getWatchlist, addTicker, removeTicker, toggleTicker, hasTicker,
  subscribeWatchlist, useWatchlist, WatchlistStar, WatchlistWidget,
});
