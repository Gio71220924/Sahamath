/* ============================================================
   risk.jsx — Profil Risiko (Sharpe + Markowitz MPT).
   A short quiz scores the user's risk appetite, then calls
   /portfolio to recommend an allocation built from Modern
   Portfolio Theory (efficient frontier, max-Sharpe / min-vol).
   EDUKASI ONLY — bukan rekomendasi investasi.
   Exposes global: RiskPage.
   ============================================================ */

const { useState: useStateR, useEffect: useEffectR, useMemo: useMemoR } = React;

/* Each option carries a score 1 (defensive) .. 3 (aggressive).
   5 questions → total 5..15 → mapped to a profile below. */
const RISK_QUESTIONS = [
  {
    q: 'Tujuan utama kamu investasi saham?',
    options: [
      { label: 'Jaga nilai uang, minim rugi', score: 1 },
      { label: 'Tumbuh stabil jangka panjang', score: 2 },
      { label: 'Cuan maksimal, berani ambil risiko', score: 3 },
    ],
  },
  {
    q: 'Berapa lama rencana kamu pegang saham?',
    options: [
      { label: 'Di bawah 1 tahun', score: 1 },
      { label: '1–3 tahun', score: 2 },
      { label: 'Lebih dari 3 tahun', score: 3 },
    ],
  },
  {
    q: 'Portofolio kamu tiba-tiba turun 20% sebulan. Reaksi?',
    options: [
      { label: 'Panik, jual semua', score: 1 },
      { label: 'Tahan, tunggu pulih', score: 2 },
      { label: 'Tambah beli, lagi diskon', score: 3 },
    ],
  },
  {
    q: 'Seberapa paham kamu soal pasar saham?',
    options: [
      { label: 'Masih pemula', score: 1 },
      { label: 'Lumayan, sudah pernah trading', score: 2 },
      { label: 'Cukup berpengalaman', score: 3 },
    ],
  },
  {
    q: 'Porsi dana yang kamu siap investasikan ke saham?',
    options: [
      { label: 'Cuma uang dingin sedikit', score: 1 },
      { label: 'Sebagian tabungan', score: 2 },
      { label: 'Porsi besar, siap fluktuatif', score: 3 },
    ],
  },
];

const PROFILE_META = {
  conservative: {
    key: 'conservative',
    label: 'Konservatif',
    color: 'var(--success)',
    blurb: 'Prioritas jaga modal. Portofolio diarahkan ke volatilitas minimum (min-vol).',
  },
  moderate: {
    key: 'moderate',
    label: 'Moderat',
    color: 'var(--warning)',
    blurb: 'Seimbang antara risiko & imbal hasil. Campuran max-Sharpe dan min-vol.',
  },
  aggressive: {
    key: 'aggressive',
    label: 'Agresif',
    color: 'var(--danger)',
    blurb: 'Kejar imbal hasil maksimal per unit risiko (max-Sharpe).',
  },
};

function scoreToProfile(total) {
  if (total <= 8) return 'conservative';
  if (total <= 12) return 'moderate';
  return 'aggressive';
}

/* ---------- efficient-frontier scatter (SVG) ---------- */
function FrontierChart({ frontier, maxSharpe, minVol, recommended }) {
  const W = 560, H = 320, P = 44;
  const pts = frontier || [];
  if (pts.length < 2) return null;

  const extras = [maxSharpe, minVol, recommended].filter(Boolean);
  const xs = pts.map((p) => p.vol).concat(extras.map((e) => e.volatility));
  const ys = pts.map((p) => p.ret).concat(extras.map((e) => e.return));
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xPad = (xMax - xMin) * 0.08 || 1;
  const yPad = (yMax - yMin) * 0.08 || 1;
  const x0 = xMin - xPad, x1 = xMax + xPad;
  const y0 = yMin - yPad, y1 = yMax + yPad;

  const sx = (v) => P + ((v - x0) / (x1 - x0)) * (W - 2 * P);
  const sy = (v) => H - P - ((v - y0) / (y1 - y0)) * (H - 2 * P);

  const sharpeVals = pts.map((p) => p.sharpe);
  const sMin = Math.min(...sharpeVals), sMax = Math.max(...sharpeVals);
  const heat = (s) => {
    const t = sMax > sMin ? (s - sMin) / (sMax - sMin) : 0.5;
    const hue = 8 + t * 140; // red→green
    return `hsl(${hue}, 70%, 52%)`;
  };

  const gridY = 4, gridX = 4;
  const yTicks = Array.from({ length: gridY + 1 }, (_, i) => y0 + ((y1 - y0) * i) / gridY);
  const xTicks = Array.from({ length: gridX + 1 }, (_, i) => x0 + ((x1 - x0) * i) / gridX);

  const marker = (e, glyph, color, title, ring) => e && (
    <g>
      <circle
        cx={sx(e.volatility)} cy={sy(e.return)} r={ring ? 11 : 7}
        fill={ring ? 'none' : color}
        stroke={ring ? color : 'var(--surface)'}
        strokeWidth={ring ? 2.5 : 2}
      >
        <title>{title}: return {e.return}% · vol {e.volatility}% · Sharpe {e.sharpe}</title>
      </circle>
      <text x={sx(e.volatility)} y={sy(e.return) - (ring ? 16 : 12)} textAnchor="middle" fontSize="11" fontWeight="800" fill={color}>{glyph}</text>
    </g>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block' }} role="img" aria-label="Efficient frontier">
      {yTicks.map((v, i) => (
        <g key={`y${i}`}>
          <line x1={P} y1={sy(v)} x2={W - P} y2={sy(v)} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4" />
          <text x={P - 8} y={sy(v) + 3} textAnchor="end" fontSize="10" fill="var(--fg-faint)">{v.toFixed(0)}%</text>
        </g>
      ))}
      {xTicks.map((v, i) => (
        <text key={`x${i}`} x={sx(v)} y={H - P + 16} textAnchor="middle" fontSize="10" fill="var(--fg-faint)">{v.toFixed(0)}%</text>
      ))}
      {pts.map((p, i) => (
        <circle key={i} cx={sx(p.vol)} cy={sy(p.ret)} r="3" fill={heat(p.sharpe)} opacity="0.55" />
      ))}
      {marker(minVol, '●', 'var(--success)', 'Min Volatilitas')}
      {marker(maxSharpe, '★', '#6366f1', 'Max Sharpe')}
      {marker(recommended, '◆', 'var(--fg)', 'Rekomendasi', true)}
      <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--fg-muted)">Risiko / Volatilitas tahunan →</text>
      <text x={14} y={H / 2} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--fg-muted)" transform={`rotate(-90 14 ${H / 2})`}>Imbal hasil tahunan →</text>
    </svg>
  );
}

/* ---------- allocation bars ---------- */
function AllocationBars({ weights }) {
  const max = weights.reduce((m, w) => Math.max(m, w.weight), 0) || 1;
  const palette = ['#00a86b', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#a855f7', '#eab308', '#0ea5e9', '#22c55e'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {weights.map((w, i) => (
        <div key={w.ticker} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="mono" style={{ width: 56, fontWeight: 800, fontSize: 14 }}>{w.ticker}</span>
          <div style={{ flex: 1, height: 22, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{ width: `${(w.weight / max) * 100}%`, height: '100%', background: palette[i % palette.length], borderRadius: 6, transition: 'width .5s ease' }} />
          </div>
          <span className="mono tnum" style={{ width: 56, textAlign: 'right', fontWeight: 700, fontSize: 14 }}>{w.weight.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div style={{ padding: 16, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', flex: '1 1 140px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--fg-muted)', marginBottom: 6 }}>{label}</div>
      <div className="mono tnum" style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--fg)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* ---------- main page ---------- */
function RiskPage() {
  const [phase, setPhase] = useStateR('quiz'); // 'quiz' | 'result'
  const [answers, setAnswers] = useStateR(Array(RISK_QUESTIONS.length).fill(null));
  const [profile, setProfile] = useStateR(null);
  const [customRaw, setCustomRaw] = useStateR('');
  const [data, setData] = useStateR(null);
  const [loading, setLoading] = useStateR(false);
  const [error, setError] = useStateR(null);

  const total = useMemoR(() => answers.reduce((s, a) => s + (a || 0), 0), [answers]);
  const answered = answers.every((a) => a != null);

  const pick = (qi, score) => {
    setAnswers((prev) => {
      const next = prev.slice();
      next[qi] = score;
      return next;
    });
  };

  const parseTickers = () => Array.from(new Set(
    customRaw.toUpperCase().split(/[\s,]+/).filter((t) => /^[A-Z]{4}$/.test(t))
  )).slice(0, 12);

  const runOptimize = (prof) => {
    setLoading(true);
    setError(null);
    const tickers = parseTickers();
    const qs = `risk=${prof}${tickers.length ? `&tickers=${tickers.join(',')}` : ''}`;
    fetch(`/portfolio?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.status === 'ok') setData(d);
        else setError(d.message || 'Gagal mengoptimasi portofolio');
        setLoading(false);
      })
      .catch(() => {
        setError('Gagal menghubungi server');
        setLoading(false);
      });
  };

  const submitQuiz = () => {
    const prof = scoreToProfile(total);
    setProfile(prof);
    setPhase('result');
    runOptimize(prof);
  };

  const restart = () => {
    setPhase('quiz');
    setAnswers(Array(RISK_QUESTIONS.length).fill(null));
    setProfile(null);
    setData(null);
    setError(null);
  };

  const meta = profile ? PROFILE_META[profile] : null;

  return (
    <CalcScreen
      title="Profil risiko kamu."
      subtitle="Jawab 5 pertanyaan singkat, lalu lihat contoh alokasi saham berbasis Modern Portfolio Theory (Sharpe dan Markowitz). Edukasi, bukan ajakan beli."
    >
      {phase === 'quiz' && (
        <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ position: 'sticky', top: 12, zIndex: 5, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', boxShadow: '0 6px 18px -8px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-muted)' }}>Progres kuis</span>
              <span className="mono tnum" style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)' }}>{answers.filter((a) => a != null).length}/{RISK_QUESTIONS.length}</span>
            </div>
            <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${(answers.filter((a) => a != null).length / RISK_QUESTIONS.length) * 100}%`, height: '100%', background: 'var(--primary)', borderRadius: 999, transition: 'width .3s ease' }} />
            </div>
          </div>
          {RISK_QUESTIONS.map((item, qi) => (
            <div key={qi} style={{ padding: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>
                <span style={{ color: 'var(--primary)', marginRight: 8 }}>{qi + 1}.</span>{item.q}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {item.options.map((opt) => {
                  const active = answers[qi] === opt.score;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => pick(qi, opt.score)}
                      className="risk-choice"
                      style={{
                        textAlign: 'left', padding: '12px 16px', borderRadius: 12, fontSize: 15, fontWeight: 600,
                        border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                        background: active ? 'var(--primary-soft)' : 'var(--surface-2)',
                        color: active ? 'var(--primary)' : 'var(--fg)', cursor: 'pointer',
                        transitionProperty: 'border-color, background-color, color, transform',
                        transitionDuration: '150ms', transitionTimingFunction: 'ease-out',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{ padding: 16, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-muted)', display: 'block', marginBottom: 8 }}>
              Saham pilihan sendiri (opsional, kode 4 huruf, pisah koma)
            </label>
            <input
              value={customRaw}
              onChange={(e) => setCustomRaw(e.target.value)}
              placeholder="BBCA, TLKM, ANTM"
              className="mono"
              style={{ width: '100%', padding: '10px 14px', fontSize: 15, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)' }}
            />
            <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 6 }}>
              Digabung dengan kurasi saham sesuai profil. Maks 12 kode.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!answered && (
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-faint)' }}>
                {answers.filter((a) => a != null).length}/{RISK_QUESTIONS.length} terjawab — lengkapi dulu semua
              </span>
            )}
            <button
              type="button"
              disabled={!answered}
              onClick={submitQuiz}
              className={`btn risk-cta${answered ? ' btn-primary' : ''}`}
              style={{
                padding: '14px 28px', fontSize: 16, fontWeight: 700,
                cursor: answered ? 'pointer' : 'not-allowed',
                background: answered ? undefined : 'var(--surface-2)',
                color: answered ? undefined : 'var(--fg-faint)',
                border: answered ? undefined : '1px solid var(--border)',
              }}
            >
              Lihat rekomendasi →
            </button>
          </div>
        </div>
      )}

      {phase === 'result' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 880 }}>
          {meta && (
            <div style={{ padding: 24, background: 'var(--surface)', border: `1.5px solid ${meta.color}`, borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--fg-muted)', marginBottom: 6 }}>
                Profil kamu, skor {total}/15
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: meta.color, marginBottom: 8 }}>{meta.label}</div>
              <p style={{ margin: 0, fontSize: 15, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{meta.blurb}</p>
            </div>
          )}

          {loading && (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--fg-muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              Mengoptimasi portofolio… (download harga ~1 tahun + Monte Carlo + SLSQP)
            </div>
          )}

          {error && (
            <div style={{ padding: 20, background: 'var(--danger-soft, rgba(239,68,68,0.1))', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', color: 'var(--danger)' }}>
              {error}
              <button onClick={() => runOptimize(profile)} className="btn btn-secondary" style={{ marginLeft: 12, fontSize: 13, padding: '6px 14px' }}>Coba lagi</button>
            </div>
          )}

          {data && !loading && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <MetricCard label="Imbal hasil*" value={`${data.recommended.return}%`} sub="estimasi tahunan" color="var(--success)" />
                <MetricCard label="Volatilitas" value={`${data.recommended.volatility}%`} sub="risiko tahunan" color="var(--warning)" />
                <MetricCard label="Sharpe" value={data.recommended.sharpe} sub={`risk-free ${data.risk_free}%`} color="#6366f1" />
              </div>

              <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: -12 }}>
                *Estimasi dari data historis ~1 tahun — bukan jaminan hasil ke depan.
              </div>

              <div style={{ padding: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800 }}>Alokasi rekomendasi</h3>
                <AllocationBars weights={data.recommended.weights} />
              </div>

              <div style={{ padding: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800 }}>Efficient frontier</h3>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--fg-muted)' }}>
                  Tiap titik = satu portofolio simulasi (warna = Sharpe). <span style={{ color: '#6366f1', fontWeight: 700 }}>★ Max-Sharpe</span> · <span style={{ color: 'var(--success)', fontWeight: 700 }}>● Min-Vol</span> · <span style={{ fontWeight: 700 }}>◆ Rekomendasi (lingkaran)</span>
                </p>
                <FrontierChart frontier={data.frontier} maxSharpe={data.max_sharpe} minVol={data.min_vol} recommended={data.recommended} />
              </div>

              <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>
                Universe: <span className="mono">{data.universe.join(', ')}</span> · metode {data.method}
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={restart} className="btn btn-secondary" style={{ fontWeight: 700 }}>← Ulangi kuis</button>
            {data && !loading && (
              <button onClick={() => runOptimize(profile)} className="btn btn-secondary" style={{ fontWeight: 700 }}>↻ Hitung ulang</button>
            )}
          </div>

          {data && data.disclaimer && (
            <div style={{ padding: 18, background: 'var(--warning-soft, rgba(245,158,11,0.1))', border: '1px solid var(--warning)', borderRadius: 'var(--radius)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Icon name="info" size={18} />
              <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5, fontWeight: 600 }}>{data.disclaimer}</p>
            </div>
          )}
        </div>
      )}
    </CalcScreen>
  );
}
