/* ============================================================
   analyzer.jsx — Stock Analyzer (Bandarmology + AI demo).
   Generates deterministic mock data per ticker so re-search
   yields the same result. NOT real market data.
   Exposes globals: Analyzer.
   ============================================================ */

const { useState: useStateZ, useMemo: useMemoZ, useRef: useRefZ, useEffect: useEffectZ } = React;


const POPULAR_TICKERS = ['BBRI', 'BBCA', 'TLKM', 'ASII', 'ANTM', 'BUMI', 'BMRI', 'GOTO', 'ADRO'];
const BROKER_CODES = ['MG', 'CC', 'YP', 'RG', 'BR', 'AT', 'GR', 'CS', 'KZ', 'NI', 'DH', 'YU'];

const SCREENER_TICKERS = [
  'ADRO','AKRA','BUMI','BYAN','DEWA','DSSA',
  'ENRG','GEMS','ITMG','MEDC','PGAS','PTBA','PTRO','RAJA'
];

/* deterministic pseudo-random per ticker (LCG seeded by string hash) */
function seededRand(seed) {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function tickSizeFor(price) {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2000) return 5;
  if (price < 5000) return 10;
  return 25;
}

function generateAnalysis(ticker) {
  const rand = seededRand(ticker.toUpperCase());
  const basePrice = 500 + Math.floor(rand() * 11000);
  const tickSize = tickSizeFor(basePrice);

  // 40-period candle history
  const candles = [];
  let v = basePrice;
  for (let i = 0; i < 40; i++) {
    const open = v;
    const change = (rand() - 0.45) * basePrice * 0.04;
    v = Math.max(50, v + change);
    const high = Math.max(open, v) + rand() * basePrice * 0.015;
    const low = Math.min(open, v) - rand() * basePrice * 0.015;
    candles.push({ open, close: v, high, low });
  }
  const lastPrice = Math.round(v / tickSize) * tickSize;
  const prevPrice = Math.round(candles[candles.length - 2].close / tickSize) * tickSize;
  const chgPct = ((lastPrice - prevPrice) / prevPrice) * 100;

  // top buyers & sellers
  const buyers = BROKER_CODES.slice(0, 8)
    .map((c) => ({
      code: c,
      netVal: (rand() * 60 + 10) * 1e9,
      avgPrice: lastPrice + (rand() - 0.6) * basePrice * 0.02,
    }))
    .sort((a, b) => b.netVal - a.netVal)
    .slice(0, 5);

  const sellers = BROKER_CODES.slice(4, 12)
    .map((c) => ({
      code: c,
      netVal: (rand() * 60 + 10) * 1e9,
      avgPrice: lastPrice + (rand() - 0.4) * basePrice * 0.02,
    }))
    .sort((a, b) => b.netVal - a.netVal)
    .slice(0, 5);

  // AI plan
  const isBullish = rand() > 0.45;
  const entry = lastPrice;
  const tp = Math.round((entry * (1 + (isBullish ? 0.06 : 0.04))) / tickSize) * tickSize;
  const sl = Math.round((entry * (1 - (isBullish ? 0.025 : 0.04))) / tickSize) * tickSize;
  const winRate = Math.round(48 + rand() * 22);
  const signal = isBullish
    ? rand() > 0.4
      ? 'BUY'
      : 'STRONG BUY'
    : rand() > 0.6
      ? 'HOLD'
      : 'SELL';
  const strength = Math.round(55 + rand() * 35);

  return {
    ticker,
    lastPrice,
    chgPct,
    candles,
    buyers,
    sellers,
    plan: { entry, tp, sl, signal, winRate, strength, isBullish },
  };
}

/* ---------- Candlestick chart ---------- */
function CandleChart({ data, height = 360 }) {
  const w = 1200;
  const pad = 40;
  const min = Math.min(...data.map((c) => c.low)) * 0.998;
  const max = Math.max(...data.map((c) => c.high)) * 1.002;
  const range = max - min || 1;
  const cw = (w - pad * 2) / data.length;
  const y = (v) => pad + (1 - (v - min) / range) * (height - pad * 2);

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <line
          key={i}
          x1={pad}
          y1={pad + p * (height - pad * 2)}
          x2={w - pad}
          y2={pad + p * (height - pad * 2)}
          stroke="var(--border)"
          strokeDasharray="2 4"
          opacity="0.6"
        />
      ))}
      {data.map((c, i) => {
        const cx = pad + i * cw + cw / 2;
        const up = c.close >= c.open;
        const color = up ? 'var(--success)' : 'var(--danger)';
        const bodyTop = y(Math.max(c.open, c.close));
        const bodyBot = y(Math.min(c.open, c.close));
        return (
          <g key={i}>
            <line x1={cx} y1={y(c.high)} x2={cx} y2={y(c.low)} stroke={color} strokeWidth="1.2" />
            <rect
              x={cx - cw * 0.32}
              y={bodyTop}
              width={cw * 0.64}
              height={Math.max(1, bodyBot - bodyTop)}
              fill={color}
            />
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- Broker table ---------- */
function BrokerTable({ title, subtitle, list, color, icon }) {
  const cellTh = {
    padding: '10px 20px',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--fg-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  };
  return (
    <div className="card broker-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ color }}>
          <Icon name={icon} size={18} />
        </span>
        <div>
          <div style={{ fontWeight: 800, color }}>{title}</div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--fg-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 700,
            }}
          >
            {subtitle}
          </div>
        </div>
      </div>
      <table className="broker-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--surface-2)' }}>
            <th style={{ ...cellTh, textAlign: 'left' }}>Broker</th>
            <th style={{ ...cellTh, textAlign: 'right' }}>Net Value</th>
            <th style={{ ...cellTh, textAlign: 'right' }}>Avg Price</th>
          </tr>
        </thead>
        <tbody>
          {list.map((b, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td className="broker-cell-code" style={{ padding: '12px 20px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 28,
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  {b.code}
                </span>
              </td>
              <td
                className="mono tnum broker-cell-value"
                style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700, color }}
              >
                Rp {fmt.compact(b.netVal)}
              </td>
              <td
                className="mono tnum broker-cell-price"
                style={{
                  padding: '12px 20px',
                  textAlign: 'right',
                  color: 'var(--fg-muted)',
                  fontWeight: 600,
                }}
              >
                Rp {Math.round(b.avgPrice).toLocaleString('id-ID')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- ML Plan Chart — real candles + entry/TP/SL lines ---------- */
function MLPlanChart({ candles, plan }) {
  const W = 1000, H = 360, PAD = { t: 16, r: 72, b: 32, l: 12 };
  const n = candles.length;
  if (!n) return null;

  const [hover, setHover] = useStateZ(null);
  const svgRef = useRefZ(null);

  const prices = candles.flatMap((c) => [c.high, c.low]);
  const rawMin = Math.min(...prices, plan.stop_loss, plan.target_profit);
  const rawMax = Math.max(...prices, plan.stop_loss, plan.target_profit);
  const pad    = (rawMax - rawMin) * 0.06;
  const lo = rawMin - pad, hi = rawMax + pad;
  const range = hi - lo || 1;

  const PAD_L  = 62;
  const cw     = (W - PAD_L - PAD.r) / n;
  const chartH = H - PAD.t - PAD.b;
  const fy     = (v) => PAD.t + (1 - (v - lo) / range) * chartH;
  const fx     = (i) => PAD_L + i * cw + cw / 2;

  const hline = (price, color, dash, label) => (
    <g key={label}>
      <line x1={PAD_L} y1={fy(price)} x2={W - PAD.r} y2={fy(price)}
        stroke={color} strokeWidth={1.5} strokeDasharray={dash} opacity={0.9} />
      <rect x={W - PAD.r + 2} y={fy(price) - 14} width={PAD.r - 4} height={28}
        fill={color} rx={4} opacity={0.15} />
      <text x={W - PAD.r + 6} y={fy(price) - 4} fill={color}
        fontSize={8} fontWeight={900} fontFamily="sans-serif" opacity={0.85}>
        {label}
      </text>
      <text x={W - PAD.r + 6} y={fy(price) + 8} fill={color}
        fontSize={9} fontWeight={700} fontFamily="JetBrains Mono,monospace">
        {Math.round(price).toLocaleString('id-ID')}
      </text>
    </g>
  );

  // sample ~6 date labels
  const dateIdxs = [0, Math.floor(n*0.2), Math.floor(n*0.4), Math.floor(n*0.6), Math.floor(n*0.8), n-1]
    .filter((v, i, a) => a.indexOf(v) === i);

  const onMouseMove = (e) => {
    const svg = svgRef.current;
    const pt  = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const { x: svgX, y: svgY } = pt.matrixTransform(svg.getScreenCTM().inverse());
    const idx   = Math.min(n - 1, Math.max(0, Math.floor((svgX - PAD_L) / cw)));
    const price = lo + (1 - (svgY - PAD.t) / chartH) * range;
    setHover({ idx, svgX: fx(idx), svgY, price });
  };

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
      onMouseMove={onMouseMove} onMouseLeave={() => setHover(null)}>
      {/* grid + Y-axis price labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
        const priceAtLevel = hi - p * range;
        return (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD.r}
              y1={PAD.t + p * chartH} y2={PAD.t + p * chartH}
              stroke="var(--border)" strokeDasharray="2 4" opacity={0.5} />
            <text x={PAD_L - 4} y={PAD.t + p * chartH + 4}
              textAnchor="end" fontSize={9} fill="var(--fg-muted)"
              fontFamily="JetBrains Mono,monospace" fontWeight={600}>
              {Math.round(priceAtLevel).toLocaleString('id-ID')}
            </text>
          </g>
        );
      })}

      {/* candles */}
      {candles.map((c, i) => {
        const up    = c.close >= c.open;
        const col   = up ? 'var(--success)' : 'var(--danger)';
        const bodyT = fy(Math.max(c.open, c.close));
        const bodyB = fy(Math.min(c.open, c.close));
        const bodyH = Math.max(1.5, bodyB - bodyT);
        const cx    = fx(i);
        const hw    = Math.max(1, cw * 0.35);
        return (
          <g key={i}>
            <line x1={cx} x2={cx} y1={fy(c.high)} y2={fy(c.low)} stroke={col} strokeWidth={1.2} />
            <rect x={cx - hw} y={bodyT} width={hw*2} height={bodyH} fill={col} />
          </g>
        );
      })}

      {/* TP / Entry / SL lines */}
      {hline(plan.target_profit, 'var(--success)', '6 3', 'TP')}
      {hline(plan.entry, '#4d8fff', '0', 'ENTRY')}
      {hline(plan.stop_loss, 'var(--danger)', '6 3', 'SL')}

      {/* date labels */}
      {dateIdxs.map((i) => (
        <text key={'d'+i} x={fx(i)} y={H - 4} textAnchor="middle"
          fontSize={9} fill="var(--fg-muted)" fontFamily="sans-serif">
          {candles[i].time.slice(5)}
        </text>
      ))}

      {/* crosshair */}
      {hover && (() => {
        const c   = candles[hover.idx];
        const cx  = hover.svgX;
        return (
          <g>
            {/* vertical line */}
            <line x1={cx} x2={cx} y1={PAD.t} y2={H - PAD.b}
              stroke="var(--fg-muted)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
            {/* horizontal line */}
            <line x1={PAD_L} x2={W - PAD.r} y1={hover.svgY} y2={hover.svgY}
              stroke="var(--fg-muted)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
            {/* price label on Y axis */}
            <rect x={PAD_L - 52} y={hover.svgY - 9} width={50} height={18} rx={3}
              fill="#4d8fff" opacity={0.9} />
            <text x={PAD_L - 27} y={hover.svgY + 4} textAnchor="middle"
              fontSize={9} fontWeight={700} fill="white" fontFamily="JetBrains Mono,monospace">
              {Math.round(hover.price).toLocaleString('id-ID')}
            </text>
            {/* date label on X axis */}
            <rect x={cx - 22} y={H - PAD.b + 2} width={44} height={14} rx={3}
              fill="#4d8fff" opacity={0.9} />
            <text x={cx} y={H - PAD.b + 12} textAnchor="middle"
              fontSize={9} fontWeight={700} fill="white" fontFamily="sans-serif">
              {c.time.slice(5)}
            </text>
            {/* OHLC info — pojok kiri atas */}
            {[
              { lbl: 'O', val: c.open,  color: 'var(--fg)' },
              { lbl: 'H', val: c.high,  color: 'var(--success)' },
              { lbl: 'L', val: c.low,   color: 'var(--danger)' },
              { lbl: 'C', val: c.close, color: c.close >= c.open ? 'var(--success)' : 'var(--danger)' },
            ].map(({ lbl, val, color }, i) => (
              <g key={lbl}>
                <text x={PAD_L + 4 + i * 68} y={PAD.t + 13}
                  fontSize={10} fontWeight={700} fill="var(--fg-muted)" fontFamily="sans-serif">
                  {lbl}
                </text>
                <text x={PAD_L + 14 + i * 68} y={PAD.t + 13}
                  fontSize={10} fontWeight={700} fill={color} fontFamily="JetBrains Mono,monospace">
                  {Math.round(val).toLocaleString('id-ID')}
                </text>
              </g>
            ))}
          </g>
        );
      })()}
    </svg>
  );
}

/* ---------- Analyzer chart — ML plan when ready, else TradingView ---------- */
function AnalyzerChart({ ticker, mlData, mlLoading }) {
  const tvTheme = useTVTheme();

  if (mlLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--fg-muted)' }}>
        <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Memuat chart dari yfinance...</span>
      </div>
    );
  }

  if (mlData?.status === 'success' && mlData.chart_history?.length) {
    const plan = mlData.trading_plan;
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* legend */}
        <div style={{ display: 'flex', gap: 16, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--fg)' }}>{ticker} · 60 Hari</span>
          {[
            { label: 'ENTRY', val: plan.entry,         color: '#4d8fff',        pct: null },
            { label: 'TP',    val: plan.target_profit, color: 'var(--success)', pct: '+' + plan.tp_percent + '%' },
            { label: 'SL',    val: plan.stop_loss,     color: 'var(--danger)',  pct: plan.sl_percent + '%' },
          ].map(({ label, val, color, pct }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 20, height: 2, background: color, display: 'inline-block', borderRadius: 1 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg)', fontWeight: 700 }}>
                Rp {Math.round(val).toLocaleString('id-ID')}
              </span>
              {pct && <span style={{ fontSize: 10, color, fontWeight: 800 }}>{pct}</span>}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <MLPlanChart candles={mlData.chart_history} plan={plan} />
        </div>
      </div>
    );
  }

  return (
    <TVWidget
      widget="advanced-chart"
      height="100%"
      config={{
        autosize: true, symbol: 'IDX:' + ticker, interval: 'D',
        timezone: 'Asia/Jakarta', theme: tvTheme, style: '1',
        locale: 'id', hide_side_toolbar: true,
        allow_symbol_change: false, save_image: false,
        withdateranges: true,
      }}
    />
  );
}

/* ---------- Strategy Picker ---------- */
const STRATEGY_OPTIONS = [
  { id: 'triple', label: 'Triple Confirmation', sub: 'RSI + MACD + MA20', enabled: true },
  { id: 'institutional', label: 'Institutional Trend', sub: 'MA200 + EMA Cross', enabled: false },
  { id: 'volatility', label: 'Volatility Sniper', sub: 'BB + Stoch', enabled: false },
];

function StrategyPicker({ strategies, mode, onStrategiesChange, onModeChange }) {
  const toggle = (id) => {
    if (!STRATEGY_OPTIONS.find((o) => o.id === id)?.enabled) return;
    const next = strategies.includes(id)
      ? strategies.filter((s) => s !== id)
      : [...strategies, id];
    if (next.length === 0) return;
    onStrategiesChange(next);
  };

  return (
    <div className="card strategy-picker" style={{ marginBottom: 16, padding: '14px 16px' }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Strategi
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {STRATEGY_OPTIONS.map((opt) => {
              const checked = strategies.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    cursor: opt.enabled ? 'pointer' : 'not-allowed',
                    opacity: opt.enabled ? 1 : 0.4,
                  }}
                  onClick={() => toggle(opt.id)}
                >
                  <span className={`strategy-checkbox${checked && opt.enabled ? ' checked' : ''}`} />
                  <span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{opt.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--fg-muted)', marginLeft: 6 }}>({opt.sub})</span>
                    {!opt.enabled && (
                      <span style={{ fontSize: 10, color: 'var(--fg-faint)', marginLeft: 6, fontStyle: 'italic' }}>coming soon</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Mode
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['and', 'or'].map((m) => (
              <button
                key={m}
                onClick={() => onModeChange(m)}
                className={`strategy-mode-btn${mode === m ? ' active' : ''}`}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--fg-faint)', maxWidth: 140, lineHeight: 1.4, marginTop: 2 }}>
            {mode === 'and' ? 'Semua strategi harus setuju' : 'Minimal satu strategi setuju'}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Screener Panel ---------- */
function ScreenerPanel({ data, loading, error, lastScan, onRefresh, onSelect }) {
  const fmt = (v) => v != null ? (typeof v === 'number' ? v.toLocaleString('id-ID') : v) : '—';
  const fmtPct = (v) => v != null ? v.toFixed(1) + '%' : '—';
  const fmtCMF = (v) => v != null ? (v >= 0 ? '+' : '') + v.toFixed(3) : '—';
  const fmtPrice = (v) => v != null ? v.toLocaleString('id-ID') : '—';

  const lastScanStr = lastScan
    ? lastScan.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          {lastScanStr ? `Scan Terakhir: ${lastScanStr}` : 'Belum pernah di-scan'}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: '6px 14px', opacity: loading ? 0.5 : 1 }}
        >
          {loading ? 'Scanning...' : '↻ Refresh'}
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && !data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} style={{
              height: 40, borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)', animation: 'pulse 1.5s infinite',
              opacity: 0.6 - i * 0.02,
            }} />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{
          padding: 20, borderRadius: 'var(--radius)',
          background: 'rgba(220,50,50,0.08)', border: '1px solid var(--danger)',
          color: 'var(--danger)', fontSize: 13, textAlign: 'center',
        }}>
          {error} — Coba klik Refresh.
        </div>
      )}

      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
        }}
      >
        {[
          { label: 'Swing', value: 'Skor setup swing. 9+ kuat, 6-8 watchlist, 4-5 early setup.' },
          { label: 'VSA', value: 'Baca volume-spread: Demand/No Supply bagus, Climax/Weak Rally hati-hati.' },
          { label: 'BO Entry', value: 'Harga trigger breakout di atas resistance pendek.' },
          { label: 'PB Entry', value: 'Area pullback untuk cicil saat harga turun sehat.' },
          { label: 'TP / SL', value: 'Target dan batas rugi dari BO Entry, memakai rasio risiko sekitar 1:2.' },
          { label: 'Vol / RS', value: 'Vol adalah volume vs rata-rata. RS adalah kekuatan saham vs IHSG.' },
        ].map((item) => (
          <div key={item.label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--primary)', marginTop: 2 }}>
              <Icon name="info" size={14} />
            </span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--fg)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.45 }}>
                {item.value}
              </div>
            </div>
          </div>
        ))}
      </div>


      {/* Table */}
      {data && (
        <div className="screener-mobile-list">
          {data.map((row) => {
            const isError = row.status === 'error';
            const swingColor = isError
              ? 'var(--fg-faint)'
              : (row.swing?.score >= 9 ? 'var(--primary)' : row.swing?.score >= 6 ? 'var(--success)' : row.swing?.score >= 4 ? 'var(--warning)' : 'var(--fg-muted)');
            return (
              <button
                key={row.ticker}
                type="button"
                className="screener-mobile-card"
                onClick={() => !isError && onSelect(row.ticker)}
                disabled={isError}
              >
                <div className="screener-mobile-card-head">
                  <div>
                    <div className="screener-mobile-ticker">{row.ticker}</div>
                    <div className="screener-mobile-sub" style={{ color: swingColor }}>
                      {isError ? row.message : `${row.swing?.score ?? 0} - ${row.swing?.setup ?? '-'}`}
                    </div>
                  </div>
                  <div className="screener-mobile-signal" style={{ color: isError ? 'var(--danger)' : 'var(--fg)' }}>
                    {isError ? 'ERROR' : fmtPrice(row.price)}
                  </div>
                </div>

                {!isError && (
                  <>
                    {row.strategies?.triple && (() => {
                      const tc = row.strategies.triple;
                      const sigColor = tc.signal.includes('BUY') ? 'var(--primary)' : tc.signal.includes('SELL') ? 'var(--danger)' : 'var(--fg-muted)';
                      const macdLabel = tc.macd_signal === 'bullish_cross' ? '↑ Bullish' : tc.macd_signal === 'bearish_cross' ? '↓ Bearish' : '— No cross';
                      return (
                        <div className="screener-strategy-block">
                          <div className="screener-strategy-head">
                            <span className="screener-strategy-label">Triple</span>
                            <span style={{ color: sigColor, fontWeight: 700, fontSize: 12 }}>{tc.signal}</span>
                            <span className="screener-strategy-score">{tc.score} / 100</span>
                          </div>
                          <div className="screener-score-bar-track">
                            <div className="screener-score-bar-fill" style={{ width: `${tc.score}%`, background: sigColor }} />
                          </div>
                          <div className="screener-strategy-breakdown">
                            <span>RSI <strong style={{ color: tc.rsi < 40 ? 'var(--primary)' : tc.rsi > 60 ? 'var(--danger)' : 'var(--fg)' }}>{tc.rsi}</strong></span>
                            <span>MACD <strong>{macdLabel}</strong></span>
                            <span>MA20 <strong style={{ color: tc.ma20_position === 'above' ? 'var(--primary)' : 'var(--danger)' }}>{tc.ma20_position === 'above' ? '↑ Above' : '↓ Below'}</strong></span>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="screener-mobile-meta">
                      <span>VSA</span>
                      <strong>{row.swing?.vsa || '-'}</strong>
                      <span>Vol</span>
                      <strong>{row.swing?.volume_ratio != null ? row.swing.volume_ratio.toFixed(2) + 'x' : '-'}</strong>
                      <span>RS</span>
                      <strong>{row.swing?.relative_strength_20d != null ? (row.swing.relative_strength_20d * 100).toFixed(1) + '%' : '-'}</strong>
                    </div>
                    <div className="screener-mobile-levels">
                      {[
                        ['BO', fmtPrice(row.swing?.bo_entry ?? row.swing?.entry)],
                        ['PB', fmtPrice(row.swing?.pb_entry)],
                        ['TP', fmtPrice(row.swing?.target)],
                        ['SL', fmtPrice(row.swing?.stop_loss)],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <span>{label}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}

      {data && (
        <div className="screener-table-wrap" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Ticker', 'Strategi', 'Skor', 'Swing', 'VSA', 'BO Entry', 'PB Entry', 'TP', 'SL', 'Risk', 'Vol', 'RS', 'Harga'].map((h) => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: h === 'Ticker' ? 'left' : 'right',
                    fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
                    color: 'var(--fg-muted)', textTransform: 'uppercase',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const isError = row.status === 'error';
                const bg = 'transparent';
                return (
                  <tr
                    key={row.ticker}
                    onClick={() => !isError && onSelect(row.ticker)}
                    style={{
                      background: bg,
                      borderBottom: '1px solid var(--border)',
                      cursor: isError ? 'default' : 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { if (!isError) e.currentTarget.style.background = 'var(--surface-2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = bg; }}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', color: 'var(--fg)' }}>
                      {row.ticker}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: isError || !row.strategies?.triple ? 'var(--fg-faint)' : row.strategies.triple.signal.includes('BUY') ? 'var(--primary)' : row.strategies.triple.signal.includes('SELL') ? 'var(--danger)' : 'var(--fg-muted)' }}>
                      {isError || !row.strategies?.triple ? '—' : row.strategies.triple.signal}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      {isError || !row.strategies?.triple ? '—' : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                          <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--fg)' }}>{row.strategies.triple.score}</span>
                          <div style={{ width: 48, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${row.strategies.triple.score}%`, background: row.strategies.triple.signal.includes('BUY') ? 'var(--primary)' : row.strategies.triple.signal.includes('SELL') ? 'var(--danger)' : 'var(--fg-muted)', borderRadius: 2 }} />
                          </div>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, color: isError ? 'var(--fg-faint)' : (row.swing?.score >= 9 ? 'var(--primary)' : row.swing?.score >= 6 ? 'var(--success)' : row.swing?.score >= 4 ? 'var(--warning)' : 'var(--fg-muted)') }}>
                      {isError ? <span title={row.message} style={{ fontSize: 11, background: 'var(--danger)', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>Error</span> : `${row.swing?.score ?? 0} · ${row.swing?.setup ?? '-'}`}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: row.swing?.vsa === 'Climax Risk' || row.swing?.vsa === 'Weak Rally' ? 'var(--danger)' : row.swing?.vsa === 'Neutral' ? 'var(--fg-muted)' : 'var(--primary)', fontWeight: 700 }}>
                      {isError ? '—' : (row.swing?.vsa || '—')}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--fg)' }}>{isError ? '—' : fmtPrice(row.swing?.bo_entry ?? row.swing?.entry)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--warning)' }}>{isError ? '—' : fmtPrice(row.swing?.pb_entry)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--primary)' }}>{isError ? '—' : fmtPrice(row.swing?.target)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--danger)' }}>{isError ? '—' : fmtPrice(row.swing?.stop_loss)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--fg-muted)' }}>{isError ? '—' : fmtPct(row.swing?.risk_pct)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{isError ? '—' : (row.swing?.volume_ratio != null ? row.swing.volume_ratio.toFixed(2) + 'x' : '—')}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: row.swing?.relative_strength_20d >= 0 ? 'var(--primary)' : 'var(--danger)', fontFamily: 'JetBrains Mono, monospace' }}>{isError ? '—' : (row.swing?.relative_strength_20d != null ? (row.swing.relative_strength_20d * 100).toFixed(1) + '%' : '—')}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--fg)' }}>{isError ? '—' : fmtPrice(row.price)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 11, color: 'var(--fg-faint)', lineHeight: 1.5 }}>
        Klik baris untuk buka analisis lengkap. Skor swing dari indikator teknikal — bukan rekomendasi investasi. DYOR.
      </div>
    </div>
  );
}

/* ---------- Analyzer screen ---------- */
function fmtMcapFull(v) {
  if (!v) return '—';
  if (v >= 1e12) return 'Rp ' + (v / 1e12).toFixed(1).replace('.', ',') + ' T';
  if (v >= 1e9) return 'Rp ' + (v / 1e9).toFixed(1).replace('.', ',') + ' M';
  return 'Rp ' + v.toLocaleString('id-ID');
}

function FundamentalCard({ data, loading }) {
  if (loading && !data) {
    return <div className="fund-card"><div className="fund-loading">Memuat fundamental…</div></div>;
  }
  if (!data) return null;
  const fmt = (v, suffix = '') => (v == null ? '—' : v + suffix);
  const metrics = [
    { label: 'Market Cap', value: fmtMcapFull(data.marketCap), hint: 'kapitalisasi pasar' },
    { label: 'PER', value: fmt(data.per, '×'), hint: 'harga ÷ laba' },
    { label: 'PBV', value: fmt(data.pbv, '×'), hint: 'harga ÷ nilai buku' },
    { label: 'ROE', value: fmt(data.roe, '%'), hint: 'laba ÷ ekuitas' },
    { label: 'Div Yield', value: fmt(data.divYield, '%'), hint: 'imbal hasil dividen' },
    { label: 'EPS', value: data.eps == null ? '—' : 'Rp ' + data.eps.toLocaleString('id-ID'), hint: 'laba per saham' },
    { label: 'Profit Margin', value: fmt(data.profitMargin, '%'), hint: 'margin laba bersih' },
    { label: 'Beta', value: fmt(data.beta), hint: 'volatilitas vs pasar' },
  ];
  return (
    <div className="fund-card">
      <div className="fund-head">
        <div>
          <div className="fund-name">{data.name || '—'}</div>
          <div className="fund-sector">{[data.sector, data.industry].filter(Boolean).join(' · ') || '—'}</div>
        </div>
        <span className="badge">FUNDAMENTAL</span>
      </div>
      <div className="fund-grid">
        {metrics.map((m) => (
          <div key={m.label} className="fund-metric">
            <div className="fund-metric-label">{m.label}</div>
            <div className="fund-metric-value">{m.value}</div>
            <div className="fund-metric-hint">{m.hint}</div>
          </div>
        ))}
      </div>
      {(data.low52 != null && data.high52 != null) && (
        <div className="fund-52w">
          52 minggu: <strong>Rp {data.low52.toLocaleString('id-ID')}</strong> — <strong>Rp {data.high52.toLocaleString('id-ID')}</strong>
        </div>
      )}
      <div className="fund-disclaimer">Data fundamental dari yfinance · bukan rekomendasi investasi.</div>
    </div>
  );
}

const AI_SENTIMENT = {
  positif:  { label: 'Positif',  color: 'var(--success)', bg: 'rgba(0,168,107,0.12)', glyph: '▲' },
  negatif:  { label: 'Negatif',  color: 'var(--danger)',  bg: 'rgba(239,68,68,0.12)', glyph: '▼' },
  netral:   { label: 'Netral',   color: 'var(--fg-muted)', bg: 'var(--surface-2)',     glyph: '◆' },
  campuran: { label: 'Campuran', color: 'var(--warning)', bg: 'rgba(245,158,11,0.12)', glyph: '◇' },
};
const AI_IMPACT = { positif: 'var(--success)', negatif: 'var(--danger)', netral: 'var(--fg-muted)' };

function AiAnalysisCard({ data, loading, error, onRetry }) {
  const headerBadge = (
    <div className="badge" style={{ marginBottom: 0 }}>
      <Icon name="chart" size={12} />
      <span>ANALISIS AI · KATALIS & SENTIMEN</span>
    </div>
  );

  let body;
  if (loading) {
    body = <div style={{ padding: '20px 0', color: 'var(--fg-muted)', fontSize: 14 }}>Membaca berita & menganalisis… (Gemini)</div>;
  } else if (error) {
    body = (
      <div style={{ padding: '12px 0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</span>
        <button onClick={onRetry} className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 14px' }}>Coba lagi</button>
      </div>
    );
  } else if (data && data.analysis) {
    const a = data.analysis;
    const s = AI_SENTIMENT[a.sentimen] || AI_SENTIMENT.netral;
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--fg)' }}>{data.name}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: s.color, background: s.bg, padding: '4px 12px', borderRadius: 999 }}>
            {s.glyph} Sentimen {s.label}
          </span>
          {data.cached && <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>· dari cache</span>}
        </div>

        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: 'var(--fg)' }}>{a.ringkasan}</p>

        {a.katalis && a.katalis.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--fg-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Katalis</div>
            {a.katalis.map((k, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ marginTop: 6, width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: AI_IMPACT[k.dampak] || 'var(--fg-muted)' }} />
                <span style={{ fontSize: 14, color: 'var(--fg)', lineHeight: 1.4 }}>
                  {k.judul}
                  {k.sumber && <span style={{ color: 'var(--fg-faint)' }}> · {k.sumber}</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {(a.risiko || a.outlook) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, fontSize: 13, color: 'var(--fg-muted)' }}>
            {a.risiko && <div><strong style={{ color: 'var(--fg)' }}>Risiko:</strong> {a.risiko}</div>}
            {a.outlook && <div><strong style={{ color: 'var(--fg)' }}>Outlook:</strong> {a.outlook}</div>}
          </div>
        )}

        {data.articles && data.articles.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--fg-faint)', width: '100%' }}>Sumber berita:</span>
            {data.articles.map((art, i) => (
              <a key={i} href={art.link} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', background: 'var(--surface-2)', padding: '4px 10px', borderRadius: 8 }}>
                {art.source} ↗
              </a>
            ))}
          </div>
        )}

        {data.disclaimer && (
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', lineHeight: 1.4 }}>{data.disclaimer}</div>
        )}
      </div>
    );
  } else {
    body = null;
  }

  if (!body) return null;
  return (
    <div className="card" style={{ padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {headerBadge}
      {body}
    </div>
  );
}

function PriceRangeCard({ r }) {
  if (!r) return null;
  return (
    <div style={{ marginTop: 10, padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', color: 'var(--fg-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
        Kisaran harga {r.horizon} hari (80%)
      </div>
      <div className="mono tnum" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontSize: 15, fontWeight: 800 }}>
        <span style={{ color: 'var(--danger)' }}>
          Rp {r.p10.toLocaleString('id-ID')} <span style={{ fontSize: 11 }}>({r.p10_pct}%)</span>
        </span>
        <span style={{ color: 'var(--fg-faint)' }}>–</span>
        <span style={{ color: 'var(--primary)' }}>
          Rp {r.p90.toLocaleString('id-ID')} <span style={{ fontSize: 11 }}>(+{r.p90_pct}%)</span>
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 6, lineHeight: 1.5 }}>
        Dari volatilitas 20 hari: 8 dari 10 kali, harga {r.horizon} hari ke depan ada di kisaran ini. Ini ukuran risiko, bukan arah.
      </div>
    </div>
  );
}

function Analyzer({ initialTicker }) {
  const [ticker, setTicker] = useStateZ('BBRI');
  const [active, setActive] = useStateZ('BBRI');
  const [loading, setLoading] = useStateZ(false);
  const [mlData, setMlData] = useStateZ(null);
  const [mlLoading, setMlLoading] = useStateZ(false);
  const [bandData, setBandData] = useStateZ(null);
  const [suggestions, setSuggestions] = useStateZ([]);
  const [showSugg, setShowSugg] = useStateZ(false);
  const debounceRef = useRefZ(null);

  const todayStr = () => new Date().toISOString().slice(0, 10);
  const daysAgoStr = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const [bandFrom, setBandFrom] = useStateZ(() => daysAgoStr(7));
  const [bandTo,   setBandTo]   = useStateZ(() => todayStr());
  const activeBand = useRefZ('');
  const [tvPrice, setTvPrice] = useStateZ(null);
  const activePrice = useRefZ('');
  const [fundData, setFundData] = useStateZ(null);
  const [fundLoading, setFundLoading] = useStateZ(false);
  const activeFund = useRefZ('');
  const [activeTab, setActiveTab] = useStateZ('analisis');
  const [scanData, setScanData]   = useStateZ(null);
  const [scanLoading, setScanLoading] = useStateZ(false);
  const [scanError, setScanError] = useStateZ(null);
  const [lastScan, setLastScan]   = useStateZ(null);
  const hasScannedRef = useRefZ(false);
  const [strategies, setStrategies] = useStateZ(['triple']);
  const [mode, setMode] = useStateZ('and');
  const [aiData, setAiData] = useStateZ(null);
  const [aiLoading, setAiLoading] = useStateZ(false);
  const [aiError, setAiError] = useStateZ(null);
  const activeAi = useRefZ('');

  const fetchTVPrice = (code) => {
    activePrice.current = code;
    setTvPrice(null);
    fetch('/price?ticker=' + code)
      .then((r) => r.json())
      .then((d) => { if (activePrice.current === code && d.price) setTvPrice(d); })
      .catch(() => {});
  };

  const fetchBandarmology = (code, from, to) => {
    activeBand.current = code;
    setBandData(null);
    const url = `/bandarmology?ticker=${code}&from=${from}&to=${to}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => { if (activeBand.current === code) setBandData(d.buyers ? d : null); })
      .catch(() => { if (activeBand.current === code) setBandData(null); });
  };

  const fetchFundamentals = (code) => {
    activeFund.current = code;
    setFundData(null);
    setFundLoading(true);
    fetch('/fundamentals?ticker=' + code)
      .then((r) => r.json())
      .then((d) => { if (activeFund.current === code) { setFundData(d.status === 'ok' ? d.data : null); setFundLoading(false); } })
      .catch(() => { if (activeFund.current === code) { setFundData(null); setFundLoading(false); } });
  };

  const fetchAiAnalysis = (code) => {
    activeAi.current = code;
    setAiData(null);
    setAiError(null);
    setAiLoading(true);
    fetch('/ai-analysis?ticker=' + code)
      .then((r) => r.json())
      .then((d) => {
        if (activeAi.current !== code) return;
        if (d.status === 'ok') setAiData(d);
        else setAiError(d.message || 'Gagal memuat analisis AI');
        setAiLoading(false);
      })
      .catch(() => { if (activeAi.current === code) { setAiError('Gagal menghubungi server'); setAiLoading(false); } });
  };

  const data = useMemoZ(() => generateAnalysis(active), [active]);

  useEffectZ(() => { fetchTVPrice('BBRI'); fetchBandarmology('BBRI', bandFrom, bandTo); fetchFundamentals('BBRI'); fetchAiAnalysis('BBRI'); }, []);

  const onSearchInput = (val) => {
    setTicker(val);
    clearTimeout(debounceRef.current);
    if (val.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(() => {
      fetch('/search?q=' + encodeURIComponent(val))
        .then((r) => r.json())
        .then((d) => setSuggestions(d.results || []))
        .catch(() => setSuggestions([]));
    }, 280);
  };

  const run = (t) => {
    const code = (t || ticker).toUpperCase().trim();
    if (!code) return;
    setLoading(true);
    setMlData(null);
    setMlLoading(true);
    setBandData(null);
    setSuggestions([]);
    setShowSugg(false);
    setTicker(code);
    setTimeout(() => { setActive(code); setLoading(false); }, 500);
    fetchTVPrice(code);
    fetch('/ml-predict?ticker=' + code)
      .then((r) => r.json())
      .then((d) => { setMlData(d); setMlLoading(false); })
      .catch(() => { setMlData({ status: 'offline' }); setMlLoading(false); });
    fetchBandarmology(code, bandFrom, bandTo);
    fetchFundamentals(code);
    fetchAiAnalysis(code);
  };

  useEffectZ(() => {
    if (initialTicker) run(initialTicker);
  }, [initialTicker]);

  const runScreener = (overrideStrategies, overrideMode) => {
    if (scanLoading) return;
    const strats = overrideStrategies || strategies;
    const m = overrideMode || mode;
    setScanLoading(true);
    setScanError(null);
    fetch(`/screener?strategies=${strats.join(',')}&mode=${m}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.status === 'ok') {
          setScanData(d.results);
          setLastScan(new Date());
        } else {
          setScanError(d.message || 'Scan gagal');
        }
        setScanLoading(false);
      })
      .catch(() => {
        setScanError('Gagal menghubungi server');
        setScanLoading(false);
      });
  };

  return (
    <CalcScreen
      icon="chart"
      tag="ANALYZER · BANDARMOLOGY + AI"
      title={
        <>
          Lacak <span style={{ color: 'var(--primary)' }}>smart money</span>
          <br />
          per saham IDX.
        </>
      }
      subtitle="Top broker buyer/seller, fundamental, plus trading plan (entry/TP/SL) dari ATR. Cek siapa yang akumulasi sebelum lo masuk."
    >
      {/* search bar */}
      <div style={{ marginBottom: 24, position: 'relative' }}>
        <div
          className="card"
          style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
        >
          <div
            style={{
              display: 'flex', flex: 1, minWidth: 240, gap: 10, alignItems: 'center',
              padding: '8px 16px', background: 'var(--surface-2)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            }}
          >
            <Icon name="target" size={20} />
            <input
              value={ticker}
              onChange={(e) => onSearchInput(e.target.value.toUpperCase())}
              onFocus={() => setShowSugg(true)}
              onBlur={() => setTimeout(() => setShowSugg(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') run();
                if (e.key === 'Escape') { setSuggestions([]); setShowSugg(false); }
              }}
              placeholder="Masukkan kode saham..."
              maxLength={10}
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: 22, fontWeight: 800, color: 'var(--fg)',
                letterSpacing: '-0.01em', textTransform: 'uppercase',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
          </div>
          <button onClick={() => run()} className="btn btn-primary" disabled={loading}>
            {loading ? 'Loading...' : <>Analisa <Icon name="arrow_right" size={14} /></>}
          </button>
        </div>

        {/* Suggestions dropdown */}
        {showSugg && suggestions.length > 0 && (
          <div
            className="card"
            style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              padding: 6, marginTop: 4, boxShadow: 'var(--shadow-lg)',
            }}
          >
            {suggestions.map((s) => (
              <button
                key={s.symbol}
                onMouseDown={() => { setTicker(s.symbol); run(s.symbol); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '10px 14px', background: 'transparent', border: 'none',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <span
                  className="mono"
                  style={{ fontWeight: 800, fontSize: 14, color: 'var(--fg)', minWidth: 60 }}
                >
                  {s.symbol}
                </span>
                <span style={{ fontSize: 13, color: 'var(--fg-muted)', flex: 1 }}>{s.name}</span>
                <span style={{ fontSize: 11, color: 'var(--fg-faint)', fontWeight: 600 }}>{s.exchange}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* quick tickers */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: 'var(--fg-muted)',
            textTransform: 'uppercase',
            alignSelf: 'center',
          }}
        >
          POPULER:
        </span>
        {POPULAR_TICKERS.map((t) => (
          <button
            key={t}
            onClick={() => run(t)}
            style={{
              padding: '6px 12px',
              background: active === t ? 'var(--primary)' : 'var(--surface)',
              color: active === t ? 'var(--primary-fg)' : 'var(--fg)',
              border: '1px solid ' + (active === t ? 'var(--primary)' : 'var(--border)'),
              borderRadius: 'var(--radius)',
              fontSize: 12,
              fontWeight: 800,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {[
          { key: 'analisis', label: 'Analisis' },
          { key: 'screener', label: 'Screener IDX Energy' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              setActiveTab(key);
              if (key === 'screener' && !hasScannedRef.current) {
                hasScannedRef.current = true;
                runScreener();
              }
            }}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === key ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === key ? 'var(--primary)' : 'var(--fg-muted)',
              fontWeight: 800,
              fontSize: 13,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'analisis' && (<>
      <AiAnalysisCard data={aiData} loading={aiLoading} error={aiError} onRetry={() => fetchAiAnalysis(active)} />
      {/* price header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', gap: 10 }}>
            {active}
            <WatchlistStar ticker={active} size={26} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span className="mono tnum" style={{ fontSize: 28, fontWeight: 800, color: 'var(--fg)' }}>
              {tvPrice ? 'Rp ' + tvPrice.price.toLocaleString('id-ID') : '—'}
            </span>
            {tvPrice && (
              <span style={{ fontSize: 13, fontWeight: 700, color: tvPrice.change_pct >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {tvPrice.change_pct >= 0 ? '+' : ''}{tvPrice.change_pct?.toFixed(2)}%
              </span>
            )}
            <span style={{ fontSize: 11, color: 'var(--fg-faint)', fontWeight: 600 }}>
              {tvPrice ? 'TradingView' : 'memuat...'}
            </span>
          </div>
          <PaperBuyButton ticker={active} price={tvPrice ? tvPrice.price : null} />
        </div>
        <div className="badge">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />{' '}
          {tvPrice ? 'Real · TradingView' : 'EOD · 7 hari terakhir'}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16, height: 420 }}>
        <AnalyzerChart ticker={active} mlData={mlData} mlLoading={mlLoading} />
      </div>

      <FundamentalCard data={fundData} loading={fundLoading} />

      {/* Trading Plan (ATR) */}
      <div
        className="calc-grid analyzer-ml-grid"
        style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 16 }}
      >
        {/* Card 1: Trading Plan */}
        <div className="card analyzer-ml-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary-soft)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="rocket" size={18} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--fg)' }}>Trading Plan</div>
                <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                  {mlData?.status === 'success' ? 'ATR · Live Data' : 'Jalankan npm start'}
                </div>
              </div>
            </div>
          </div>

          {mlLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0', color: 'var(--fg-muted)' }}>
              <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>Menghitung indikator...</div>
              <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>Download data + hitung indikator (~5–10 detik)</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : mlData?.status === 'success' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--fg-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Entry</span>
                <span className="mono tnum" style={{ fontSize: 18, fontWeight: 800, color: 'var(--fg)' }}>
                  Rp {mlData.trading_plan.entry.toLocaleString('id-ID')}
                </span>
              </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div style={{ padding: 14, background: 'var(--primary-soft)', borderRadius: 12, border: '1px solid color-mix(in oklab, var(--primary) 25%, transparent)' }}>
                    <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', color: 'var(--primary)', marginBottom: 4 }}>TARGET PROFIT</div>
                    <div className="mono tnum" style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>Rp {mlData.trading_plan.target_profit.toLocaleString('id-ID')}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: 'var(--primary)' }}>+{mlData.trading_plan.tp_percent}%</div>
                  </div>
                  <div style={{ padding: 14, background: 'color-mix(in oklab, var(--danger) 10%, transparent)', borderRadius: 12, border: '1px solid color-mix(in oklab, var(--danger) 25%, transparent)' }}>
                    <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', color: 'var(--danger)', marginBottom: 4 }}>STOP LOSS</div>
                    <div className="mono tnum" style={{ fontSize: 18, fontWeight: 800, color: 'var(--danger)' }}>Rp {mlData.trading_plan.stop_loss.toLocaleString('id-ID')}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: 'var(--danger)' }}>{mlData.trading_plan.sl_percent}%</div>
                  </div>
                </div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', lineHeight: 1.5 }}>
                {mlData.trading_plan.note}
              </div>
              <PriceRangeCard r={mlData.price_range} />
              {/* Indicators mini grid */}
              <div className="analyzer-metric-grid" style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  { label: 'Stoch %K',  value: mlData.indicators?.stoch != null ? mlData.indicators.stoch.toFixed(1) : '—' },
                  { label: 'BB',        value: mlData.indicators?.bb_pos ?? '—' },
                  { label: 'ADX',       value: mlData.indicators?.adx != null ? mlData.indicators.adx.toFixed(1) : '—' },
                  { label: 'CMF',       value: mlData.indicators?.cmf != null ? mlData.indicators.cmf.toFixed(3) : '—' },
                  { label: 'MFI',       value: mlData.indicators?.mfi != null ? mlData.indicators.mfi.toFixed(1) : '—' },
                  { label: 'Vol Ratio', value: mlData.indicators?.vol_ratio != null ? mlData.indicators.vol_ratio.toFixed(2) + 'x' : '—' },
                  { label: 'IHSG',      value: mlData.market?.regime ?? '—' },
                  { label: 'RS IHSG',   value: mlData.market?.relative_strength_20d != null ? (mlData.market.relative_strength_20d * 100).toFixed(1) + '%' : '—' },
                ].map((m) => (
                  <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: 10, color: 'var(--fg-muted)', fontWeight: 700 }}>{m.label}</span>
                    <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg)' }}>{m.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : mlData?.status === 'error' ? (
            <div style={{ fontSize: 13, color: 'var(--danger)', padding: 16, background: 'color-mix(in oklab, var(--danger) 8%, transparent)', borderRadius: 'var(--radius-sm)' }}>
              {mlData.message}
              <PriceRangeCard r={mlData.price_range} />
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--fg-muted)', padding: 16, background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', lineHeight: 1.6 }}>
              {mlData === null ? (
                loading ? 'Memuat data...' : 'Klik Analisa untuk memuat trading plan dari data live.'
              ) : (
                <>Fitur ini memerlukan server lokal.<br /><strong style={{ color: 'var(--fg)' }}>npm start</strong> untuk mengaktifkan.</>
              )}
            </div>
          )}
        </div>

      </div>

      {/* broker tables — date range picker */}
      <div
        className="band-filter-row"
        style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
          marginBottom: 12, padding: '10px 16px',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}
      >
        <Icon name="chart" size={16} />
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Rentang Data
        </span>
        <input
          type="date"
          value={bandFrom}
          max={bandTo}
          onChange={(e) => setBandFrom(e.target.value)}
          className="input"
          style={{ padding: '6px 10px', fontSize: 13, width: 'auto' }}
        />
        <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>s/d</span>
        <input
          type="date"
          value={bandTo}
          min={bandFrom}
          max={todayStr()}
          onChange={(e) => setBandTo(e.target.value)}
          className="input"
          style={{ padding: '6px 10px', fontSize: 13, width: 'auto' }}
        />
        <button
          className="btn btn-secondary"
          style={{ padding: '6px 14px', fontSize: 13 }}
          onClick={() => active && fetchBandarmology(active, bandFrom, bandTo)}
        >
          Perbarui
        </button>
        {bandData && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
            Data live · {bandFrom} s/d {bandTo}
          </span>
        )}
      </div>

      <div className="calc-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <BrokerTable
          title="Top Buyer"
          subtitle={bandData ? `Live · ${bandFrom} s/d ${bandTo}` : mlData?.bandarmology ? 'Live · ML (7 hari)' : 'Akumulasi terbesar'}
          list={bandData ? bandData.buyers : (mlData?.bandarmology?.top_buyers ?? data.buyers)}
          color="var(--success)"
          icon="rocket"
        />
        <BrokerTable
          title="Top Seller"
          subtitle={bandData ? `Live · ${bandFrom} s/d ${bandTo}` : mlData?.bandarmology ? 'Live · ML (7 hari)' : 'Distribusi terbesar'}
          list={bandData ? bandData.sellers : (mlData?.bandarmology?.top_sellers ?? data.sellers)}
          color="var(--danger)"
          icon="arrow_left"
        />
      </div>

      <div
        style={{
          marginTop: 24,
          padding: 18,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        <span style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }}>
          <Icon name="info" size={18} />
        </span>
        <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
          <strong style={{ color: 'var(--fg)' }}>Disclaimer:</strong> Data bandarmology dari api-saham. Trading Plan berupa level risiko dari ATR dan volatilitas — bukan prediksi arah atau rekomendasi beli/jual. DYOR.
        </div>
      </div>
      </>)}

      {activeTab === 'screener' && (
        <>
          <StrategyPicker
            strategies={strategies}
            mode={mode}
            onStrategiesChange={(s) => setStrategies(s)}
            onModeChange={(m) => setMode(m)}
          />
          <ScreenerPanel
            data={scanData}
            loading={scanLoading}
            error={scanError}
            lastScan={lastScan}
            onRefresh={runScreener}
            onSelect={(t) => { setActiveTab('analisis'); run(t); }}
          />
        </>
      )}
    </CalcScreen>
  );
}

Object.assign(window, { Analyzer });
