/* ============================================================
   analyzer.jsx — Stock Analyzer (ATR trading plan + AI).
   Exposes globals: Analyzer.
   ============================================================ */

const { useState: useStateZ, useRef: useRefZ, useEffect: useEffectZ } = React;


const POPULAR_TICKERS = ['BBRI', 'BBCA', 'TLKM', 'ASII', 'ANTM', 'BUMI', 'BMRI', 'GOTO', 'ADRO'];

const SCREENER_TICKERS = [
  'ADRO','AKRA','BUMI','BYAN','DEWA','DSSA',
  'ENRG','GEMS','ITMG','MEDC','PGAS','PTBA','PTRO','RAJA'
];

/* ---------- ML Plan Chart — real candles + entry/TP/SL lines ---------- */
function MLPlanChart({ candles, plan }) {
  const [hover, setHover] = useStateZ(null);
  const svgRef = useRefZ(null);
  const W = 1000, H = 360, PAD = { t: 16, r: 72, b: 32, l: 12 };
  const n = candles.length;
  if (!n) return null;

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
      {hline(plan.target_profit, 'var(--success)', '6 3', 'Target')}
      {hline(plan.entry, '#4d8fff', '0', 'Entry')}
      {hline(plan.stop_loss, 'var(--danger)', '6 3', 'Stop')}

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
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--fg)' }}>{ticker}, 60 hari</span>
          {[
            { label: 'Entry',  val: plan.entry,         color: '#4d8fff',        pct: null },
            { label: 'Target', val: plan.target_profit, color: 'var(--success)', pct: '+' + plan.tp_percent + '%' },
            { label: 'Stop',   val: plan.stop_loss,     color: 'var(--danger)',  pct: plan.sl_percent + '%' },
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
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-muted)', marginBottom: 10 }}>
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
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-muted)' }}>
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
const SCREEN_GROUPS = [
  { key: 'watch', title: 'Layak dipantau', note: 'skor 6 ke atas', test: (s) => s >= 6 },
  { key: 'early', title: 'Mulai terbentuk', note: 'skor 4 sampai 5', test: (s) => s >= 4 && s < 6 },
  { key: 'skip', title: 'Lewati dulu', note: 'skor di bawah 4', test: (s) => s < 4 },
];
const TRIPLE_LABEL = {
  'STRONG BUY': 'Beli kuat', 'LEAN BUY': 'Condong beli', NEUTRAL: 'Netral',
  'LEAN SELL': 'Condong jual', 'STRONG SELL': 'Jual kuat',
};

function ScreenerPanel({ data, loading, error, lastScan, onRefresh, onSelect }) {
  const price = (v) => (v != null ? Math.round(v).toLocaleString('id-ID') : '–');
  const pct = (v) => (v != null ? v.toFixed(1).replace('.', ',') + '%' : '–');
  const rs = (v) => (v != null ? (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1).replace('.', ',') + '%' : '–');
  const scanned = lastScan
    ? lastScan.toLocaleString('id-ID', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : null;
  const ok = (data || []).filter((r) => r.status !== 'error');
  const failed = (data || []).filter((r) => r.status === 'error');
  const th = { padding: '10px 12px 6px', fontWeight: 600, fontSize: 13, color: 'var(--fg-muted)', textAlign: 'right', whiteSpace: 'nowrap' };
  const td = { padding: 12, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--fg)', whiteSpace: 'nowrap' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px 24px' }}>
        <p style={{ margin: 0, maxWidth: '68ch', color: 'var(--fg-muted)', fontSize: 14, lineHeight: 1.6 }}>
          {data ? `${data.length} saham` : 'Belum dipindai'}{scanned ? `, dipindai ${scanned}` : ''}. Skornya 0 sampai 12,
          dari tren harga, volume, dan arus dana. Masuk breakout berarti beli kalau harga menembus level itu;
          masuk pullback berarti menunggu harga turun dulu.
        </p>
        <button type="button" onClick={onRefresh} disabled={loading} className="btn btn-secondary" style={{ minHeight: 44, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Memindai...' : 'Pindai ulang'}
        </button>
      </div>

      {loading && !data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ height: 40, background: 'var(--surface-2)', animation: 'pulse 1.5s infinite', opacity: 0.6 - i * 0.04 }} />
          ))}
        </div>
      )}

      {error && (
        <div role="alert" style={{ padding: 16, border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: 14 }}>
          {error}. Coba pindai ulang.
        </div>
      )}

      {data && SCREEN_GROUPS.map((g) => {
        const rows = ok.filter((r) => g.test(r.swing?.score ?? 0));
        if (!rows.length) return null;
        return (
          <section key={g.key} aria-labelledby={`scr-${g.key}`}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 14px', borderBottom: '2px solid var(--fg)', paddingBottom: 8 }}>
              <h3 id={`scr-${g.key}`} style={{ margin: 0, fontSize: 20 }}>{g.title}</h3>
              <span style={{ color: 'var(--fg-muted)', fontSize: 14 }}>{rows.length} saham, {g.note}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                {/* lebar tetap: kolom sejajar di semua kelompok */}
                <colgroup>
                  {[8, 14, 8, 11, 11, 9, 9, 8, 12, 10].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" style={{ ...th, textAlign: 'left', paddingLeft: 0 }}>Saham</th>
                    <th scope="col" style={{ ...th, textAlign: 'left' }}>Skor</th>
                    <th scope="col" style={th}>Harga</th>
                    <th scope="col" style={th}>Masuk breakout</th>
                    <th scope="col" style={th}>Masuk pullback</th>
                    <th scope="col" style={th}>Target</th>
                    <th scope="col" style={th}>Stop</th>
                    <th scope="col" style={th}>Risiko</th>
                    <th scope="col" style={th}>Vs IHSG 20 hari</th>
                    <th scope="col" style={{ ...th, paddingRight: 0 }}>Triple</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const s = r.swing || {};
                    const t = r.strategies?.triple;
                    const score = s.score ?? 0;
                    return (
                      <tr key={r.ticker} style={{ borderTop: '1px solid var(--border)' }}>
                        <th scope="row" style={{ textAlign: 'left', padding: '12px 12px 12px 0' }}>
                          <button type="button" onClick={() => onSelect(r.ticker)} style={{ font: 'inherit', fontSize: 16, fontWeight: 800, color: 'var(--fg)', textDecoration: 'underline', textUnderlineOffset: 3, minHeight: 32 }}>
                            {r.ticker}
                          </button>
                        </th>
                        <td style={{ ...td, textAlign: 'left' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            {score}/12
                            <span aria-hidden="true" style={{ display: 'inline-block', width: 60, height: 6, background: 'var(--border)' }}>
                              <span style={{ display: 'block', height: 6, width: `${(score / 12) * 100}%`, background: 'var(--fg)' }} />
                            </span>
                          </span>
                        </td>
                        <td style={td}>{price(r.price)}</td>
                        <td style={td}>{price(s.bo_entry ?? s.entry)}</td>
                        <td style={td}>{price(s.pb_entry)}</td>
                        <td style={{ ...td, color: 'var(--success)' }}>{price(s.target)}</td>
                        <td style={{ ...td, color: 'var(--danger)' }}>{price(s.stop_loss)}</td>
                        <td style={td}>{pct(s.risk_pct)}</td>
                        <td style={{ ...td, color: (s.relative_strength_20d ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>{rs(s.relative_strength_20d)}</td>
                        <td style={{ ...td, paddingRight: 0, fontFamily: 'inherit' }}>{t ? (TRIPLE_LABEL[t.signal] || t.signal) : '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {failed.length > 0 && (
        <p style={{ margin: 0, color: 'var(--fg-muted)', fontSize: 13 }}>Gagal dipindai: {failed.map((r) => r.ticker).join(', ')}.</p>
      )}
      <p style={{ margin: 0, maxWidth: '70ch', color: 'var(--fg-muted)', fontSize: 13, lineHeight: 1.6 }}>
        Setup ini bahan riset, bukan sinyal beli. Dari 294 ribu plan serupa di IDX, stop lebih sering kena duluan
        daripada target dalam 10 hari. Klik kode saham untuk analisis lengkap.
      </p>
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
          <div className="fund-sector">{[data.sector, data.industry].filter(Boolean).join(', ') || '—'}</div>
        </div>
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
      <div className="fund-disclaimer">Data fundamental dari yfinance, bukan rekomendasi investasi.</div>
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
    <h3 style={{ fontSize: 15, color: 'var(--fg-muted)', letterSpacing: 0 }}>Ringkasan berita oleh AI</h3>
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
          {data.cached && <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>dari cache</span>}
        </div>

        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: 'var(--fg)' }}>{a.ringkasan}</p>

        {a.katalis && a.katalis.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-muted)' }}>Katalis</div>
            {a.katalis.map((k, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ marginTop: 6, width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: AI_IMPACT[k.dampak] || 'var(--fg-muted)' }} />
                <span style={{ fontSize: 14, color: 'var(--fg)', lineHeight: 1.4 }}>
                  {k.judul}
                  {k.sumber && <span style={{ color: 'var(--fg-faint)' }}>, {k.sumber}</span>}
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
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-muted)', marginBottom: 6 }}>
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
        Dari volatilitas harian, mingguan, dan bulanan (HAR): 8 dari 10 kali, harga {r.horizon} hari ke depan ada di kisaran ini. Ini ukuran risiko, bukan arah.
      </div>
    </div>
  );
}

/* ---------- Nota rencana trading (struk) + kepemilikan KSEI ---------- */
// NotaEdge/NotaRow/NotaCut + NOTA_* ada di components.jsx (dipakai Landing juga).
const OWN_COLORS = { asing: '#2b57a6', ritel: '#a8742c', asuransi: '#3f7f78', reksadana: '#6b4f9a', korporasi: '#8c908b', lainnya: '#c4c8c2' };

function NotaCard({ plan, range, ticker }) {
  if (!plan) return null;
  const rp = (v) => Math.round(v).toLocaleString('id-ID');
  const pct = (v) => (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1).replace('.', ',') + '%';
  const rr = (plan.target_profit - plan.entry) / (plan.entry - plan.stop_loss);
  const b = plan.base_rates;
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <section aria-label={`Nota rencana trading ${ticker}`} style={{ flex: '0 1 340px', minWidth: 280, filter: 'drop-shadow(0 10px 18px rgba(25, 27, 26, 0.18))' }}>
      <NotaEdge />
      <div className="mono tnum" style={{ background: '#fcfcfa', color: NOTA_INK, padding: '12px 22px 16px', fontSize: 12.5, lineHeight: 1.75 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Satoshi, system-ui, sans-serif', fontWeight: 800, fontSize: 20 }}>sahamath</div>
          <div>Nota rencana trading</div>
          <div style={{ color: '#5e625e' }}>{ticker}, {today}</div>
        </div>
        <NotaCut />
        <NotaRow k="Entry" v={rp(plan.entry)} />
        <NotaRow k="Target (2× ATR)" v={`${rp(plan.target_profit)} ${pct(plan.tp_percent)}`} c={NOTA_UP} />
        <NotaRow k="Stop (1,5× ATR)" v={`${rp(plan.stop_loss)} ${pct(plan.sl_percent)}`} c={NOTA_DOWN} />
        <NotaRow k="Untung : rugi" v={`${rr.toFixed(2).replace('.', ',')} : 1`} />
        {range && (
          <>
            <NotaCut />
            <div>Kisaran {range.horizon} hari, 8 dari 10 kali:</div>
            <div style={{ textAlign: 'right', color: NOTA_INFO }}>{rp(range.p10)} sampai {rp(range.p90)}</div>
          </>
        )}
        {b && (
          <>
            <NotaCut />
            <div>Dari {Math.round(b.sample / 1000)} ribu plan serupa di IDX, {b.days} hari:</div>
            <NotaRow k="Kena target duluan" v={`${b.tp_first}%`} c={NOTA_UP} />
            <NotaRow k="Kena stop duluan" v={`${b.sl_first}%`} c={NOTA_DOWN} />
            <NotaRow k="Belum kena keduanya" v={`${b.neither}%`} />
          </>
        )}
        <NotaCut />
        <p style={{ margin: 0 }}>Ini level risiko, bukan saran beli.</p>
        <p style={{ margin: '12px 0 0', textAlign: 'center' }}>Saham yang sudah dibeli<br />tidak dapat dikembalikan.</p>
      </div>
      <NotaEdge bottom />
    </section>
  );
}

// Riset train_anomalies.py: 20% saham paling liar rata-rata tertinggal 1,76%/bulan dari pasar.
function VolatilityCard({ vol, ticker }) {
  if (!vol) return null;
  const pct = Math.min(Math.max(vol.percentile, 2), 98);
  return (
    <section aria-labelledby="vol-h">
      <h3 id="vol-h" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--fg)' }}>Seberapa liar {ticker}</h3>
      <p style={{ margin: '2px 0 10px', fontSize: 13, color: 'var(--fg-muted)' }}>
        Rata-rata bergerak {vol.vol60.toFixed(1).replace('.', ',')}% per hari dalam 60 hari terakhir,
        lebih liar dari sekitar {vol.percentile}% saham likuid IDX.
      </p>
      <div aria-hidden="true" style={{ position: 'relative', display: 'flex', gap: 2, height: 10 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} style={{ flex: 1, background: i === 4 ? 'color-mix(in oklab, var(--danger) 35%, transparent)' : 'var(--surface-2)', border: '1px solid var(--border)' }} />
        ))}
        <span style={{ position: 'absolute', top: -4, bottom: -4, left: `${pct}%`, width: 3, marginLeft: -1.5, background: 'var(--fg)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>
        <span>Paling tenang</span><span>20% paling liar</span>
      </div>
      {vol.top_quintile && (
        <p style={{ margin: '10px 0 0', fontSize: 13, fontWeight: 600, color: 'var(--danger)' }}>
          Termasuk 20% saham paling liar. Dari 2021 sampai 2026, kelompok ini rata-rata tertinggal 1,76% per bulan
          dari pasar, jadi pertimbangkan ukuran posisi yang lebih kecil.
        </p>
      )}
    </section>
  );
}

function OwnershipCard({ own, ticker }) {
  if (!own) return null;
  const date = (s) => new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const num = (v) => v.toFixed(2).replace('.', ',');
  const delta = (d) => (d == null ? '–' : d === 0 ? 'tetap' : (d > 0 ? '+' : '−') + num(Math.abs(d)));
  return (
    <section aria-labelledby="own-h">
      <h3 id="own-h" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--fg)' }}>Siapa yang pegang {ticker}</h3>
      <p style={{ margin: '2px 0 10px', fontSize: 13, color: 'var(--fg-muted)' }}>
        Data KSEI per {date(own.date)}{own.prev_date ? `, dibanding ${date(own.prev_date)}` : ''}.
      </p>
      <div aria-hidden="true" style={{ display: 'flex', height: 18, gap: 2 }}>
        {own.groups.map((g) => <span key={g.key} style={{ flex: Math.max(g.pct, 0), background: OWN_COLORS[g.key] }} />)}
      </div>
      <table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse', fontSize: 14 }}>
        <caption style={{ position: 'absolute', left: -9999 }}>Porsi kepemilikan {ticker} dan perubahannya dalam poin persen</caption>
        <thead>
          <tr style={{ color: 'var(--fg-muted)', fontSize: 12, textAlign: 'left' }}>
            <th scope="col" style={{ fontWeight: 600, padding: '4px 0' }}>Pemegang</th>
            <th scope="col" style={{ fontWeight: 600, padding: '4px 0', textAlign: 'right' }}>Porsi</th>
            <th scope="col" style={{ fontWeight: 600, padding: '4px 0', textAlign: 'right' }}>Perubahan</th>
          </tr>
        </thead>
        <tbody>
          {own.groups.map((g) => (
            <tr key={g.key} style={{ borderTop: '1px solid var(--border)' }}>
              <th scope="row" style={{ textAlign: 'left', fontWeight: 600, padding: '7px 0', color: 'var(--fg)' }}>
                <span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, marginRight: 8, background: OWN_COLORS[g.key] }} />
                {g.label}
              </th>
              <td className="mono tnum" style={{ textAlign: 'right', padding: '7px 0', color: 'var(--fg)' }}>{num(g.pct)}%</td>
              <td className="mono tnum" style={{ textAlign: 'right', padding: '7px 0', color: g.delta > 0 ? 'var(--success)' : g.delta < 0 ? 'var(--danger)' : 'var(--fg-muted)' }}>{delta(g.delta)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--fg-muted)' }}>
        Info, bukan sinyal: di 2024 dan 2025 porsi asing tidak membantu menebak arah harga bulan berikutnya.
      </p>
    </section>
  );
}

function Analyzer({ initialTicker }) {
  const [ticker, setTicker] = useStateZ('BBRI');
  const [active, setActive] = useStateZ('BBRI');
  const [loading, setLoading] = useStateZ(false);
  const [mlData, setMlData] = useStateZ(null);
  const [mlLoading, setMlLoading] = useStateZ(false);
  const [suggestions, setSuggestions] = useStateZ([]);
  const [showSugg, setShowSugg] = useStateZ(false);
  const debounceRef = useRefZ(null);

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


  useEffectZ(() => { fetchTVPrice('BBRI'); fetchFundamentals('BBRI'); fetchAiAnalysis('BBRI'); }, []);

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
    setSuggestions([]);
    setShowSugg(false);
    setTicker(code);
    setTimeout(() => { setActive(code); setLoading(false); }, 500);
    fetchTVPrice(code);
    fetch('/ml-predict?ticker=' + code)
      .then((r) => r.json())
      .then((d) => { setMlData(d); setMlLoading(false); })
      .catch(() => { setMlData({ status: 'offline' }); setMlLoading(false); });
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
      title="Ukur risiko per saham IDX."
      subtitle="Chart, fundamental, katalis dari berita, dan trading plan dari ATR. Cek risikonya sebelum kamu masuk."
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
        <span style={{ fontSize: 14, color: 'var(--fg-muted)', alignSelf: 'center' }}>
          Populer:
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
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', fontWeight: 600 }}>
                  {mlData?.status === 'success' ? 'Level risiko dari ATR dan data harga terbaru' : 'Jalankan npm start'}
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}>
              <NotaCard plan={mlData.trading_plan} range={mlData.price_range} ticker={active} />
              <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>
              <VolatilityCard vol={mlData.volatility} ticker={active} />
              <OwnershipCard own={mlData.ownership} ticker={active} />
              {/* Indicators mini grid */}
              <div className="analyzer-metric-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
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
              </div>
            </div>
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
          <strong style={{ color: 'var(--fg)' }}>Disclaimer:</strong> Trading Plan berupa level risiko dari ATR dan volatilitas — bukan prediksi arah atau rekomendasi beli/jual. DYOR.
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
