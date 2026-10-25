/* ============================================================
   papertrade.jsx — virtual portfolio (paper trading).
   localStorage store + pub/sub, mirrors watchlist.jsx.
   Realistic: lot system (×100), optional broker fees.
   ============================================================ */

const { useState: useStateP, useEffect: useEffectP, useRef: useRefP } = React;

const PT_KEY = 'cuanmeter:papertrade';
const PT_DEFAULT_MODAL = 100000000; // Rp 100 juta
// Fee broker dari kalkulator Profit (getFees, persen) → pecahan. Fee jual sudah termasuk pajak jual.
const ptFee = (side) => (Number(getFees()[side]) || 0) / 100;
const ptListeners = new Set();

function ptDefault() {
  return { cash: PT_DEFAULT_MODAL, initial: PT_DEFAULT_MODAL, holdings: {}, history: [], feeOn: true };
}

function getPaper() {
  try {
    const v = JSON.parse(localStorage.getItem(PT_KEY));
    if (v && typeof v === 'object' && typeof v.cash === 'number') {
      return { feeOn: true, holdings: {}, history: [], initial: PT_DEFAULT_MODAL, ...v };
    }
  } catch (e) {}
  return ptDefault();
}

function setPaper(state) {
  try { localStorage.setItem(PT_KEY, JSON.stringify(state)); } catch (e) {}
  ptListeners.forEach((fn) => fn(state));
}

function subscribePaper(fn) {
  ptListeners.add(fn);
  return () => ptListeners.delete(fn);
}

function resetPaper(modal) {
  const m = Number(modal) > 0 ? Math.round(Number(modal)) : PT_DEFAULT_MODAL;
  setPaper({ cash: m, initial: m, holdings: {}, history: [], feeOn: getPaper().feeOn });
}

function setPaperFee(on) {
  setPaper({ ...getPaper(), feeOn: !!on });
}

/* Execute a buy. Returns { ok, error? }. */
function buyPaper(ticker, lot, price) {
  const code = String(ticker).toUpperCase().trim();
  lot = Math.floor(Number(lot));
  price = Number(price);
  if (!/^[A-Z]{4}$/.test(code) || !(lot > 0) || !(price > 0)) return { ok: false, error: 'Input tidak valid' };
  const s = getPaper();
  const shares = lot * 100;
  const cost = shares * price;
  const fee = s.feeOn ? cost * ptFee('buy') : 0;
  const total = cost + fee;
  if (total > s.cash) return { ok: false, error: 'Cash tidak cukup' };
  const h = s.holdings[code] || { lot: 0, avg: 0 };
  const newLot = h.lot + lot;
  const newAvg = (h.avg * h.lot + price * lot) / newLot; // weighted avg execution price
  const holdings = { ...s.holdings, [code]: { lot: newLot, avg: Math.round(newAvg * 100) / 100 } };
  const history = [{ t: Date.now(), type: 'BUY', ticker: code, lot, price, fee: Math.round(fee) }, ...s.history].slice(0, 200);
  setPaper({ ...s, cash: Math.round(s.cash - total), holdings, history });
  return { ok: true };
}

/* Execute a sell. Returns { ok, error? }. */
function sellPaper(ticker, lot, price) {
  const code = String(ticker).toUpperCase().trim();
  lot = Math.floor(Number(lot));
  price = Number(price);
  if (!/^[A-Z]{4}$/.test(code) || !(lot > 0) || !(price > 0)) return { ok: false, error: 'Input tidak valid' };
  const s = getPaper();
  const h = s.holdings[code];
  if (!h || lot > h.lot) return { ok: false, error: 'Lot melebihi yang dimiliki' };
  const shares = lot * 100;
  const proceeds = shares * price;
  const fee = s.feeOn ? proceeds * ptFee('sell') : 0;
  const realized = (price - h.avg) * shares - fee;
  const remLot = h.lot - lot;
  const holdings = { ...s.holdings };
  if (remLot > 0) holdings[code] = { lot: remLot, avg: h.avg };
  else delete holdings[code];
  const history = [{ t: Date.now(), type: 'SELL', ticker: code, lot, price, fee: Math.round(fee), realized: Math.round(realized) }, ...s.history].slice(0, 200);
  setPaper({ ...s, cash: Math.round(s.cash + proceeds - fee), holdings, history });
  return { ok: true };
}

/* Hook: re-render on any paper-trade change (same tab). */
function usePaper() {
  const [state, setState] = useStateP(getPaper);
  useEffectP(() => subscribePaper(setState), []);
  return state;
}

/* ---------- UI ---------- */
function fmtRp(v) {
  return 'Rp ' + Math.round(v || 0).toLocaleString('id-ID');
}
function fmtRpShort(v) {
  v = v || 0;
  const a = Math.abs(v);
  if (a >= 1e12) return 'Rp ' + (v / 1e12).toFixed(2).replace('.', ',') + ' T';
  if (a >= 1e9) return 'Rp ' + (v / 1e9).toFixed(2).replace('.', ',') + ' M';
  if (a >= 1e6) return 'Rp ' + (v / 1e6).toFixed(1).replace('.', ',') + ' jt';
  return 'Rp ' + Math.round(v).toLocaleString('id-ID');
}

/* Buy/Sell ticket modal. */
function TradeModal({ ticker, price, mode, held, onClose }) {
  const s = usePaper();
  const [lot, setLot] = useStateP(mode === 'sell' ? String(held) : '1');
  const [err, setErr] = useStateP(null);
  const n = Math.floor(Number(lot)) || 0;
  const shares = n * 100;
  const value = shares * price;
  const feeRate = mode === 'buy' ? ptFee('buy') : ptFee('sell');
  const fee = s.feeOn ? value * feeRate : 0;
  const total = mode === 'buy' ? value + fee : value - fee;
  const maxBuyLot = price > 0 ? Math.floor(s.cash / (price * 100 * (1 + (s.feeOn ? ptFee('buy') : 0)))) : 0;
  const buyLimitExceeded = mode === 'buy' && total > s.cash;
  const sellLimitExceeded = mode === 'sell' && n > held;
  const invalidLot = n <= 0;
  const limitError = buyLimitExceeded
    ? `Total pembelian melebihi cash tersedia (${fmtRp(s.cash)})`
    : sellLimitExceeded
      ? `Maksimal penjualan ${held} lot`
      : invalidLot
        ? 'Jumlah lot minimal 1'
        : null;

  const submit = () => {
    if (limitError) {
      setErr(limitError);
      return;
    }
    const r = mode === 'buy' ? buyPaper(ticker, n, price) : sellPaper(ticker, n, price);
    if (r.ok) onClose(); else setErr(r.error);
  };

  return (
    <div className="paper-modal-overlay" onClick={onClose}>
      <div className="paper-modal" onClick={(e) => e.stopPropagation()}>
        <div className="paper-modal-head">
          <span>{mode === 'buy' ? 'Beli' : 'Jual'} <strong>{ticker}</strong></span>
          <button type="button" className="paper-modal-x" onClick={onClose} aria-label="Tutup">×</button>
        </div>
        <div className="paper-modal-price">Harga pasar: <strong>{fmtRp(price)}</strong></div>
        <label className="paper-field">
          <span>Jumlah lot {mode === 'buy' ? `(maks ${maxBuyLot})` : `(punya ${held})`}</span>
          <input
            type="number"
            min="1"
            max={mode === 'buy' ? maxBuyLot : held}
            value={lot}
            onChange={(e) => { setLot(e.target.value); setErr(null); }}
          />
        </label>
        <div className="paper-calc">
          <div><span>Lembar</span><span>{shares.toLocaleString('id-ID')}</span></div>
          <div><span>Nilai</span><span>{fmtRp(value)}</span></div>
          {s.feeOn && <div><span>Fee ({fmt.num(feeRate * 100, 2)}%)</span><span>{fmtRp(fee)}</span></div>}
          <div className="paper-calc-total"><span>{mode === 'buy' ? 'Total bayar' : 'Terima bersih'}</span><span>{fmtRp(total)}</span></div>
        </div>
        {(err || limitError) && <div className="paper-modal-err">{err || limitError}</div>}
        <button
          type="button"
          className={`btn ${mode === 'buy' ? 'btn-primary' : 'btn-sell'} paper-modal-submit`}
          onClick={submit}
          disabled={Boolean(limitError)}
        >
          {mode === 'buy' ? 'Konfirmasi Beli' : 'Konfirmasi Jual'}
        </button>
      </div>
    </div>
  );
}

function PaperTradePage({ onNavigate }) {
  const s = usePaper();
  const [quotes, setQuotes] = useStateP({});
  const [trade, setTrade] = useStateP(null);
  const [q, setQ] = useStateP('');
  const [results, setResults] = useStateP([]);
  const [showHist, setShowHist] = useStateP(false);
  const timer = useRefP(null);

  const tickers = Object.keys(s.holdings);
  const key = tickers.join(',');

  useEffectP(() => {
    if (!key) { setQuotes({}); return; }
    let alive = true;
    fetch('/watchlist?tickers=' + key)
      .then((r) => r.json())
      .then((d) => { if (alive) setQuotes(d.quotes || {}); })
      .catch(() => {});
    return () => { alive = false; };
  }, [key]);

  let holdingsValue = 0;
  tickers.forEach((t) => {
    const px = quotes[t] ? quotes[t].price : s.holdings[t].avg;
    holdingsValue += px * s.holdings[t].lot * 100;
  });
  const totalValue = s.cash + holdingsValue;
  const totalPL = s.initial > 0 ? (totalValue - s.initial) / s.initial * 100 : 0;

  const onSearch = (val) => {
    setQ(val);
    clearTimeout(timer.current);
    if (val.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(() => {
      fetch('/search?q=' + encodeURIComponent(val.trim()))
        .then((r) => r.json()).then((d) => setResults((d.results || []).slice(0, 6))).catch(() => setResults([]));
    }, 250);
  };
  const openBuy = (sym) => {
    setQ(''); setResults([]);
    fetch('/price?ticker=' + sym).then((r) => r.json()).then((d) => {
      if (d.price) setTrade({ ticker: String(sym).toUpperCase(), price: d.price, mode: 'buy', held: 0 });
    }).catch(() => {});
  };
  const openSell = (t) => {
    const px = quotes[t] ? quotes[t].price : s.holdings[t].avg;
    setTrade({ ticker: t, price: px, mode: 'sell', held: s.holdings[t].lot });
  };
  const doReset = () => {
    const v = window.prompt('Reset portfolio. Modal awal (Rp):', String(s.initial));
    if (v != null) resetPaper(Number(String(v).replace(/[^\d]/g, '')) || PT_DEFAULT_MODAL);
  };

  return (
    <CalcScreen
      title="Latihan trading tanpa uang asli."
      subtitle="Portofolio virtual dengan harga asli. Beli, jual, dan lihat untung-ruginya. Tersimpan di browser ini.">

      <div className="paper-summary">
        <div className="paper-sumbox"><span>Cash</span><strong>{fmtRpShort(s.cash)}</strong></div>
        <div className="paper-sumbox"><span>Nilai Portfolio</span><strong>{fmtRpShort(totalValue)}</strong></div>
        <div className="paper-sumbox"><span>Total P&L</span><strong className={totalPL >= 0 ? 'paper-up' : 'paper-dn'}>{fmt.pct(totalPL)}</strong>
          {/* rupiah juga: rugi kecil karena fee (mis. Rp 1.257) hilang di persen 2 desimal */}
          <small className={totalPL >= 0 ? 'paper-up' : 'paper-dn'}>{(totalValue - s.initial > 0 ? '+' : '') + fmt.rp(Math.round(totalValue - s.initial))}</small></div>
        <div className="paper-sum-actions">
          <label className="paper-fee-toggle"><input type="checkbox" checked={s.feeOn} onChange={(e) => setPaperFee(e.target.checked)} /> Fee</label>
          <button type="button" className="btn btn-secondary paper-reset" onClick={doReset}>↺ Reset</button>
        </div>
      </div>

      <div className="paper-buybar watchlist-search">
        <input className="watchlist-search-input" placeholder="🔍 Cari saham buat dibeli…" value={q} onChange={(e) => onSearch(e.target.value)} />
        {results.length > 0 && (
          <div className="watchlist-search-results">
            {results.map((r) => (
              <button type="button" key={r.symbol} className="watchlist-search-item" onClick={() => openBuy(r.symbol)}>
                <strong>{r.symbol}</strong> <span>{r.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {tickers.length === 0 ? (
        <div className="paper-empty">Belum ada posisi. Cari saham di atas buat mulai beli (pakai harga real).</div>
      ) : (
        <div className="paper-holdings">
          <div className="paper-hrow paper-hhead">
            <span>Saham</span><span>Lot</span><span>Avg</span><span>Last</span><span>P&L</span><span></span>
          </div>
          {tickers.map((t) => {
            const h = s.holdings[t];
            const px = quotes[t] ? quotes[t].price : null;
            const last = px != null ? px : h.avg;
            const plPct = h.avg > 0 ? (last - h.avg) / h.avg * 100 : 0;
            const up = plPct >= 0;
            return (
              <div key={t} className="paper-hrow" onClick={() => onNavigate && onNavigate('analyzer', t)}>
                <span className="paper-tk">{t}</span>
                <span>{h.lot}</span>
                <span>{fmtRp(h.avg)}</span>
                <span>{px != null ? fmtRp(px) : '…'}</span>
                <span className={up ? 'paper-up' : 'paper-dn'}>{fmt.pct(plPct)}</span>
                <button type="button" className="paper-sellbtn" onClick={(e) => { e.stopPropagation(); openSell(t); }}>Jual</button>
              </div>
            );
          })}
        </div>
      )}

      {s.history.length > 0 && (
        <div className="paper-hist">
          <button type="button" className="paper-hist-toggle" onClick={() => setShowHist(!showHist)}>
            Riwayat transaksi ({s.history.length}) {showHist ? '▴' : '▾'}
          </button>
          {showHist && (
            <div className="paper-hist-list">
              {s.history.map((x, i) => (
                <div key={i} className="paper-hist-row">
                  <span className={x.type === 'BUY' ? 'paper-up' : 'paper-dn'}>{x.type}</span>
                  <span className="paper-tk">{x.ticker}</span>
                  <span>{x.lot} lot @ {fmtRp(x.price)}</span>
                  <span className={x.realized >= 0 ? 'paper-up' : 'paper-dn'}>{x.type === 'SELL' && x.realized != null ? (x.realized >= 0 ? '+' : '') + fmtRp(x.realized) : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {trade && <TradeModal ticker={trade.ticker} price={trade.price} mode={trade.mode} held={trade.held} onClose={() => setTrade(null)} />}
    </CalcScreen>
  );
}

/* Standalone "Beli (paper)" button — drop into Analyzer. Opens its own buy modal. */
function PaperBuyButton({ ticker, price }) {
  const [open, setOpen] = useStateP(false);
  const [px, setPx] = useStateP(price || null);
  useEffectP(() => { setPx(price || null); }, [price]);

  if (!ticker) return null;
  const code = String(ticker).toUpperCase();
  const click = () => {
    if (px) { setOpen(true); return; }
    fetch('/price?ticker=' + code)
      .then((r) => r.json())
      .then((d) => { if (d.price) { setPx(d.price); setOpen(true); } })
      .catch(() => {});
  };

  return (
    <>
      <button type="button" className="paper-buy-btn" onClick={click}>＋ Beli (paper)</button>
      {open && px && <TradeModal ticker={code} price={px} mode="buy" held={0} onClose={() => setOpen(false)} />}
    </>
  );
}

Object.assign(window, {
  getPaper, resetPaper, setPaperFee, buyPaper, sellPaper, subscribePaper, usePaper,
  PaperTradePage, PaperBuyButton, PT_DEFAULT_MODAL,
});
