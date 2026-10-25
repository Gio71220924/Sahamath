/* ============================================================
   calculators.jsx — 5 calculator screens.
   1. AveragePrice  — multi-row average down calculator
   2. ARAARB        — IDX 2026 auto-rejection bands (tier-aware)
   3. ProfitCalc    — net P/L + breakeven price
   4. Amunisi       — position sizing (2% rule, modal komposisi)
   5. Dividen       — net dividend yield (PPh Final 10%)
   Exposes globals: AveragePrice, ARAARB, ProfitCalc, Amunisi, Dividen.
   ============================================================ */

const { useState: useStateC, useMemo: useMemoC, useEffect: useEffectC, useRef: useRefC } = React;

/* ---------- shared input ---------- */
function NumberInput({ label, value, onChange, prefix, suffix, hint, placeholder }) {
  // Teks mentah selama diketik, supaya "0," tidak langsung diformat jadi "0" (koma desimal hilang).
  const [text, setText] = useStateC(null);
  return (
    <div className="input-group">
      {label && <label className="label">{label}</label>}
      <div style={{ position: 'relative' }}>
        {prefix && (
          <span
            style={{
              position: 'absolute',
              left: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--fg-faint)',
              fontWeight: 700,
              fontSize: 14,
              pointerEvents: 'none',
            }}
          >
            {prefix}
          </span>
        )}
        <input
          className="input"
          type="text"
          inputMode="decimal"
          value={text ?? (value === '' || value == null ? '' : value.toLocaleString('id-ID'))}
          placeholder={placeholder}
          onBlur={() => setText(null)}
          onChange={(e) => {
            setText(e.target.value);
            const raw = e.target.value
              .replace(/[^\d.,]/g, '')
              .replace(/\./g, '')
              .replace(',', '.');
            const n = parseFloat(raw);
            onChange(isNaN(n) ? '' : n);
          }}
          style={{ paddingLeft: prefix ? 44 : 16, paddingRight: suffix ? 60 : 16 }}
        />
        {suffix && (
          <span
            style={{
              position: 'absolute',
              right: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--fg-muted)',
              fontWeight: 600,
              fontSize: 13,
              pointerEvents: 'none',
            }}
          >
            {suffix}
          </span>
        )}
      </div>
      {hint && <span style={{ fontSize: 12, color: 'var(--fg-faint)' }}>{hint}</span>}
    </div>
  );
}

/* ---------- screen wrapper ---------- */
function CalcScreen({ title, subtitle, children, className = '' }) {
  return (
    <main className={`calculator-screen ${className}`.trim()} style={{ padding: '48px 0 80px' }}>
      <div className="container">
        <div className="fade-up" style={{ marginBottom: 40, maxWidth: 720 }}>
          <h1
            style={{
              fontSize: 'clamp(36px, 5vw, 56px)',
              marginBottom: 12,
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
            }}
          >
            {title}
          </h1>
          <p style={{ fontSize: 17, color: 'var(--fg-muted)', lineHeight: 1.5, margin: 0 }}>
            {subtitle}
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}

/* ---------- result card ---------- */
function ResultStat({ label, value, accent, big, mono = true, hint }) {
  return (
    <div
      style={{
        padding: 18,
        background: accent ? 'var(--primary-soft)' : 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--fg-muted)',
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        className={mono ? 'mono tnum' : ''}
        style={{
          fontSize: big ? 28 : 20,
          fontWeight: 800,
          color: accent ? 'var(--primary)' : 'var(--fg)',
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {hint && <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

/* ============================================================
   1. AveragePrice
   ============================================================ */
function AveragePrice() {
  const [rows, setRows] = useStateC([
    { lot: 5, price: 11500 },
    { lot: 3, price: 11200 },
    { lot: 4, price: 11000 },
  ]);

  const result = useMemoC(() => {
    let totalLot = 0;
    let totalCost = 0;
    rows.forEach((r) => {
      const lot = Number(r.lot) || 0;
      const price = Number(r.price) || 0;
      totalLot += lot;
      totalCost += lot * 100 * price;
    });
    const avg = totalLot > 0 ? totalCost / (totalLot * 100) : 0;
    return { totalLot, totalCost, avg, totalShares: totalLot * 100 };
  }, [rows]);

  const update = (i, key, val) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  const remove = (i) => setRows(rows.filter((_, idx) => idx !== i));
  const add = () => setRows([...rows, { lot: '', price: '' }]);

  return (
    <CalcScreen
      title="Hitung harga rata-rata portofoliomu."
      subtitle="Masukkan semua transaksi beli, lalu lihat harga rata-rata dan titik impasnya sebelum memutuskan average down atau keluar."
    >
      <div className="calc-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
        {/* Inputs */}
        <div className="card" style={{ padding: 24 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <h3 style={{ fontSize: 16, color: 'var(--fg)' }}>Daftar Transaksi Beli</h3>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
              {rows.length} transaksi · 1 lot = 100 lembar
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rows.map((r, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1.4fr auto',
                  gap: 10,
                  alignItems: 'flex-end',
                }}
              >
                <NumberInput
                  label={i === 0 ? 'Lot' : ''}
                  value={r.lot}
                  onChange={(v) => update(i, 'lot', v)}
                  suffix="lot"
                  placeholder="0"
                />
                <NumberInput
                  label={i === 0 ? 'Harga / lembar' : ''}
                  value={r.price}
                  onChange={(v) => update(i, 'price', v)}
                  prefix="Rp"
                  placeholder="0"
                />
                <button
                  onClick={() => remove(i)}
                  disabled={rows.length === 1}
                  style={{
                    width: 52,
                    height: 52,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    color: rows.length === 1 ? 'var(--fg-faint)' : 'var(--danger)',
                    cursor: rows.length === 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={add}
            style={{
              marginTop: 16,
              padding: '12px 16px',
              border: '1px dashed var(--border-strong)',
              background: 'transparent',
              color: 'var(--fg-muted)',
              borderRadius: 'var(--radius)',
              fontWeight: 700,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
            }}
          >
            <Icon name="plus" size={16} />
            Tambah Transaksi
          </button>
        </div>

        {/* Output */}
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontSize: 16, color: 'var(--fg)' }}>Hasil Kalkulasi</h3>

          <div
            style={{
              padding: 24,
              background:
                'linear-gradient(135deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 70%, #003a26) 100%)',
              borderRadius: 'var(--radius-lg)',
              color: '#fff',
            }}
          >
            <div
              style={{
                fontSize: 12,
                opacity: 0.85,
                fontWeight: 700,
                letterSpacing: '0.08em',
                marginBottom: 8,
              }}
            >
              Harga rata-rata
            </div>
            <div
              className="mono tnum"
              style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}
            >
              <AnimatedNumber
                value={result.avg}
                format={(n) => 'Rp ' + n.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
              />
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 8 }}>
              Break-even price per lembar
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <ResultStat
              label="Total Lot"
              value={
                <>
                  <AnimatedNumber value={result.totalLot} />{' '}
                  <span style={{ fontSize: 14, color: 'var(--fg-muted)' }}>lot</span>
                </>
              }
              hint={fmt.num(result.totalShares) + ' lembar'}
            />
            <ResultStat
              label="Total Modal"
              value={<AnimatedNumber value={result.totalCost} format={(n) => fmt.rp(n)} />}
              hint="Sebelum fee broker"
            />
          </div>

          <div
            style={{
              background: 'var(--surface-2)',
              padding: 16,
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ color: 'var(--info)', flexShrink: 0, marginTop: 2 }}>
                <Icon name="info" size={16} />
              </span>
              <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
                <strong style={{ color: 'var(--fg)' }}>Tips:</strong> Average down hanya bekerja
                kalau fundamental sahamnya kuat dan kamu masih punya amunisi. Kalau down-nya karena
                bisnis bermasalah, cut-loss lebih baik.
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .calc-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </CalcScreen>
  );
}

/* ============================================================
   2. ARAARB — IDX berlaku 8 Apr 2025:
      ARA berjenjang per tier (kecuali Akselerasi: flat 35%)
      ARB: 15% (Utama/Pengembangan/Ekonomi Baru), 10% (Akselerasi)
   ============================================================ */
const BOARD_CONFIG = {
  utama:        { label: 'Papan Utama',        araTiers: true,  arbPct: 15 },
  pengembangan: { label: 'Papan Pengembangan', araTiers: true,  arbPct: 15 },
  ekonomi_baru: { label: 'Papan Ekonomi Baru', araTiers: true,  arbPct: 15 },
  akselerasi:   { label: 'Papan Akselerasi',   araTiers: false, araFlat: 35, arbPct: 10 },
};

// Fraksi harga resmi IDX (Peraturan II-A)
function tickSize(p) {
  if (p < 200)  return 1;
  if (p < 500)  return 2;
  if (p < 2000) return 5;
  if (p < 5000) return 10;
  return 25;
}

function ARAARB() {
  const [price, setPrice] = useStateC(11525);
  const [papan, setPapan] = useStateC('utama');
  const [boardSource, setBoardSource] = useStateC('manual'); // 'auto' | 'manual'
  const [query, setQuery] = useStateC('');
  const [searchResults, setSearchResults] = useStateC([]);
  const [searching, setSearching] = useStateC(false);
  const [selectedStock, setSelectedStock] = useStateC(null);
  const [showDropdown, setShowDropdown] = useStateC(false);
  const debounceRef = useRefC(null);
  const wrapRef = useRefC(null);

  // Debounced search
  useEffectC(() => {
    const q = query.trim();
    if (!q || q.length < 1 || selectedStock) { setSearchResults([]); setShowDropdown(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      fetch('/search?q=' + encodeURIComponent(q))
        .then((r) => r.json())
        .then((d) => { setSearchResults(d.results || []); setShowDropdown(true); setSearching(false); })
        .catch(() => setSearching(false));
    }, 300);
  }, [query, selectedStock]);

  // Click-outside close dropdown
  useEffectC(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectStock = (stock) => {
    setSelectedStock(stock);
    setQuery('');
    setShowDropdown(false);
    setSearchResults([]);
    // Auto-fill harga dari TradingView
    fetch('/price?ticker=' + stock.symbol)
      .then((r) => r.json())
      .then((d) => { if (d.price) setPrice(d.price); })
      .catch(() => {});
    // Auto-detect papan dari IDX cache
    setBoardSource('manual');
    fetch('/board?ticker=' + stock.symbol)
      .then((r) => r.json())
      .then((d) => {
        if (d.board && d.board !== 'unknown' && BOARD_CONFIG[d.board]) {
          setPapan(d.board);
          setBoardSource('auto');
        }
      })
      .catch(() => {});
  };

  const clearStock = () => {
    setSelectedStock(null);
    setQuery('');
    setBoardSource('manual');
  };

  const result = useMemoC(() => {
    const p = Number(price) || 0;
    if (p <= 0) return null;
    const cfg = BOARD_CONFIG[papan];
    let araPct, tier;
    if (cfg.araTiers) {
      if (p <= 200)      { araPct = 35; tier = 'Tier 1 (Rp 50–200)'; }
      else if (p <= 5000){ araPct = 25; tier = 'Tier 2 (Rp 201–5.000)'; }
      else               { araPct = 20; tier = 'Tier 3 (>Rp 5.000)'; }
    } else {
      araPct = cfg.araFlat;
      tier = 'Flat — semua harga';
    }
    const arbPct = cfg.arbPct;
    const rawAra = p * (1 + araPct / 100);
    const rawArb = p * (1 - arbPct / 100);
    const ara = Math.floor(rawAra / tickSize(rawAra)) * tickSize(rawAra);
    const arb = Math.max(50, Math.ceil(rawArb / tickSize(rawArb)) * tickSize(rawArb));
    return { p, araPct, arbPct, ara, arb, tier, cfg };
  }, [price, papan]);

  return (
    <CalcScreen
      title="Cek batas ARA dan ARB."
      subtitle="Cari kode saham untuk mengisi harga dan papan otomatis, atau isi manual. ARA berjenjang per tier harga, ARB 15% (papan Akselerasi 10%)."
    >
      <div className="calc-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 24 }}>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h3 style={{ fontSize: 16 }}>Input Harga & Papan</h3>

          {/* Stock search */}
          <div ref={wrapRef} style={{ position: 'relative' }}>
            <div className="label" style={{ marginBottom: 6 }}>Cari Kode Saham</div>
            {selectedStock ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px',
                background: 'var(--primary-soft)', border: '1px solid var(--primary)',
                borderRadius: 'var(--radius)',
              }}>
                <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: 15 }}>{selectedStock.symbol}</span>
                <span style={{ fontSize: 12, color: 'var(--fg-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedStock.name}</span>
                <button onClick={clearStock} style={{ background: 'none', border: 'none', color: 'var(--fg-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}>✕</button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)', pointerEvents: 'none' }}>
                  <Icon name="target" size={16} />
                </span>
                <input
                  className="input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value.toUpperCase())}
                  placeholder="BUMI, BBRI, TLKM..."
                  style={{ paddingLeft: 44, paddingRight: searching ? 40 : 16 }}
                />
                {searching && (
                  <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)', fontSize: 11, fontWeight: 700 }}>...</span>
                )}
              </div>
            )}
            {showDropdown && searchResults.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
              }}>
                {searchResults.map((s, i) => (
                  <button
                    key={i}
                    onMouseDown={() => selectStock(s)}
                    style={{
                      width: '100%', padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center',
                      background: 'transparent', border: 'none', borderBottom: i < searchResults.length - 1 ? '1px solid var(--border)' : 'none',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--primary)', minWidth: 56 }}>{s.symbol}</span>
                    <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <NumberInput
            label="Harga Saham (Rp)"
            value={price}
            onChange={setPrice}
            prefix="Rp"
            hint="Harga penutupan / referensi hari sebelumnya"
          />

          {/* Papan selector */}
          <div>
            <div className="label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              Papan Pencatatan
              {boardSource === 'auto' && (
                <span style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                  background: 'var(--primary-soft)', color: 'var(--primary)',
                  padding: '2px 8px', borderRadius: 999,
                }}>Terdeteksi otomatis</span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {Object.entries(BOARD_CONFIG).map(([id, cfg]) => (
                <button
                  key={id}
                  onClick={() => { setPapan(id); setBoardSource('manual'); }}
                  style={{
                    padding: '10px 12px', textAlign: 'left',
                    background: papan === id ? 'var(--primary)' : 'var(--surface-2)',
                    color: papan === id ? 'var(--primary-fg)' : 'var(--fg)',
                    border: '1px solid ' + (papan === id ? 'var(--primary)' : 'var(--border)'),
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{cfg.label}</div>
                  <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 600, marginTop: 2 }}>
                    ARA {cfg.araTiers ? '35/25/20%' : cfg.araFlat + '%'} · ARB {cfg.arbPct}%
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Info tier */}
          <div style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontWeight: 700, marginBottom: 6 }}>
              {BOARD_CONFIG[papan].label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>
              {result?.tier || '—'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 3 }}>
              ARA <strong style={{ color: 'var(--success)' }}>+{result?.araPct}%</strong>
              {' · '}
              ARB <strong style={{ color: 'var(--danger)' }}>−{result?.arbPct}%</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ARA */}
          <div className="card" style={{ padding: 28, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 4, background: 'var(--success)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Icon name="rocket" size={18} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--success)', letterSpacing: '0.08em' }}>
                    AUTO REJECT ATAS · MOON
                  </span>
                </div>
                <div style={{ fontSize: 14, color: 'var(--fg-muted)' }}>Batas tertinggi harga hari ini</div>
              </div>
              <div className="badge" style={{ background: 'var(--success)', color: '#fff' }}>
                +{result?.araPct}%
              </div>
            </div>
            <div className="mono tnum" style={{ fontSize: 56, fontWeight: 800, color: 'var(--success)', letterSpacing: '-0.03em', lineHeight: 1 }}>
              {result ? (
                <AnimatedNumber value={result.ara} format={(n) => 'Rp ' + Math.round(n).toLocaleString('id-ID')} />
              ) : 'Rp —'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 12 }}>
              Selisih dari harga acuan:{' '}
              <strong className="mono" style={{ color: 'var(--fg)' }}>
                +{result ? fmt.rp(result.ara - result.p) : 'Rp 0'}
              </strong>
            </div>
          </div>

          {/* ARB */}
          <div className="card" style={{ padding: 28, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 4, background: 'var(--danger)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Icon name="diamond" size={18} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--danger)', letterSpacing: '0.08em' }}>
                    AUTO REJECT BAWAH · BOTTOM
                  </span>
                </div>
                <div style={{ fontSize: 14, color: 'var(--fg-muted)' }}>Batas terendah harga hari ini</div>
              </div>
              <div className="badge" style={{ background: 'var(--danger)', color: '#fff' }}>
                −{result?.arbPct}%
              </div>
            </div>
            <div className="mono tnum" style={{ fontSize: 56, fontWeight: 800, color: 'var(--danger)', letterSpacing: '-0.03em', lineHeight: 1 }}>
              {result ? (
                <AnimatedNumber value={result.arb} format={(n) => 'Rp ' + Math.round(n).toLocaleString('id-ID')} />
              ) : 'Rp —'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 12 }}>
              Selisih dari harga acuan:{' '}
              <strong className="mono" style={{ color: 'var(--fg)' }}>
                {result ? fmt.rp(result.arb - result.p) : 'Rp 0'}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Tier table — dinamis per papan */}
      <div className="card" style={{ padding: 24, marginTop: 24 }}>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>Aturan {BOARD_CONFIG[papan].label}</h3>
        <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 16 }}>
          {papan === 'akselerasi'
            ? 'ARA flat 35% untuk semua harga. ARB flat 10%.'
            : 'ARA berjenjang per tier harga. ARB flat 15% semua tier (berlaku 8 Apr 2025).'}
        </div>
        {papan === 'akselerasi' ? (
          <div style={{ padding: 16, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', gap: 24 }}>
            <span style={{ fontSize: 13 }}><strong className="up">+35%</strong> ARA (flat semua harga)</span>
            <span style={{ fontSize: 13 }}><strong className="down">−10%</strong> ARB (flat semua harga)</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {[
              { tier: 'Tier 1', range: 'Rp 50 – Rp 200',    ara: 35, color: 'var(--info)' },
              { tier: 'Tier 2', range: 'Rp 201 – Rp 5.000', ara: 25, color: 'var(--warning)' },
              { tier: 'Tier 3', range: '> Rp 5.000',         ara: 20, color: 'var(--primary)' },
            ].map((t, i) => (
              <div key={i} style={{ padding: 16, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: t.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{t.tier}</span>
                </div>
                <div className="mono" style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 8 }}>{t.range}</div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                  <span><strong className="up">+{t.ara}%</strong> ARA</span>
                  <span><strong className="down">−15%</strong> ARB</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </CalcScreen>
  );
}

/* ============================================================
   3. ProfitCalc — net P/L after broker fees + breakeven price
   ============================================================ */
function ProfitCalc() {
  const [buyPrice, setBuyPrice] = useStateC(2500);
  const [sellPrice, setSellPrice] = useStateC(2800);
  const [lot, setLot] = useStateC(10);
  const [feeBuy, setFeeBuy] = useStateC(0.15);
  const [feeSell, setFeeSell] = useStateC(0.25);

  const result = useMemoC(() => {
    const shares = (Number(lot) || 0) * 100;
    const bp = Number(buyPrice) || 0;
    const sp = Number(sellPrice) || 0;
    const fb = (Number(feeBuy) || 0) / 100;
    const fs = (Number(feeSell) || 0) / 100;

    const buyValue = shares * bp;
    const sellValue = shares * sp;
    const buyFee = buyValue * fb;
    const sellFee = sellValue * fs;
    const totalFee = buyFee + sellFee;
    const grossPL = sellValue - buyValue;
    const netPL = grossPL - totalFee;
    const roi = buyValue > 0 ? (netPL / buyValue) * 100 : 0;
    const breakEven = bp * (1 + fb) / (1 - fs);

    return { shares, buyValue, sellValue, buyFee, sellFee, totalFee, grossPL, netPL, roi, breakEven };
  }, [buyPrice, sellPrice, lot, feeBuy, feeSell]);

  const isProfit = result.netPL >= 0;

  return (
    <CalcScreen
      title="Hitung profit bersih setelah fee."
      subtitle="Setelah dipotong fee beli dan jual, untungmu berapa? Plus harga impas supaya tahu kapan boleh jual."
    >
      <div className="calc-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 24 }}>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h3 style={{ fontSize: 16 }}>Detail Transaksi</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <NumberInput label="Harga Beli" value={buyPrice} onChange={setBuyPrice} prefix="Rp" />
            <NumberInput label="Harga Jual" value={sellPrice} onChange={setSellPrice} prefix="Rp" />
          </div>
          <NumberInput
            label="Jumlah Lot"
            value={lot}
            onChange={setLot}
            suffix="lot"
            hint={fmt.num(result.shares) + ' lembar'}
          />

          <div className="divider" />

          <h4
            style={{
              fontSize: 14,
              color: 'var(--fg-muted)',
              fontWeight: 700,
              margin: 0,
            }}
          >
            Fee broker
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <NumberInput label="Fee Beli" value={feeBuy} onChange={setFeeBuy} suffix="%" />
            <NumberInput
              label="Fee Jual"
              value={feeSell}
              onChange={setFeeSell}
              suffix="%"
              hint="Termasuk PPh 0.1%"
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>
            Default: 0.15% (beli) & 0.25% (jual) — sesuai standar broker Indonesia.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* main P/L */}
          <div
            className="card"
            style={{
              padding: 32,
              background: isProfit
                ? 'linear-gradient(135deg, var(--success) 0%, color-mix(in oklab, var(--success) 70%, #003020) 100%)'
                : 'linear-gradient(135deg, var(--danger) 0%, color-mix(in oklab, var(--danger) 70%, #401015) 100%)',
              color: '#fff',
              border: 'none',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -20,
                right: -20,
                fontSize: 200,
                opacity: 0.08,
                fontWeight: 800,
              }}
            >
              {isProfit ? '✓' : '↓'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Icon name={isProfit ? 'rocket' : 'arrow_left'} size={16} />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  opacity: 0.9,
                }}
              >
                {isProfit ? 'Untung bersih' : 'Rugi bersih'}
              </span>
            </div>
            <div
              className="mono tnum"
              style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}
            >
              <AnimatedNumber value={result.netPL} format={(n) => fmt.rp(n)} />
            </div>
            <div style={{ fontSize: 16, opacity: 0.9, marginTop: 12 }}>
              ROI: <strong className="mono">{fmt.pct(result.roi, 2)}</strong> · Setelah fee Rp{' '}
              {fmt.compact(result.totalFee)}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <ResultStat
              label="Modal Beli"
              value={fmt.rp(result.buyValue)}
              hint={'+ fee Rp ' + fmt.compact(result.buyFee)}
            />
            <ResultStat
              label="Hasil Jual"
              value={fmt.rp(result.sellValue)}
              hint={'− fee Rp ' + fmt.compact(result.sellFee)}
            />
            <ResultStat label="Profit Kotor" value={fmt.rp(result.grossPL)} />
            <ResultStat label="Total Fee" value={fmt.rp(result.totalFee)} />
          </div>

          <div
            style={{
              background: 'var(--primary-soft)',
              padding: 18,
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--primary)',
                    fontWeight: 800,
                    marginBottom: 4,
                  }}
                >
                  Harga impas
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                  Harga jual minimum supaya tidak rugi
                </div>
              </div>
              <div
                className="mono tnum"
                style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary)' }}
              >
                {fmt.rp(result.breakEven, { dec: 2 })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </CalcScreen>
  );
}

/* ============================================================
   4. Amunisi — position sizing (2% rule + modal komposisi bar)
   ============================================================ */
function Amunisi() {
  const [modal, setModal] = useStateC(50000000);
  const [riskPct, setRiskPct] = useStateC(2);
  const [entry, setEntry] = useStateC(2500);
  const [stop, setStop] = useStateC(2350);

  const result = useMemoC(() => {
    const m = Number(modal) || 0;
    const r = (Number(riskPct) || 0) / 100;
    const e = Number(entry) || 0;
    const s = Number(stop) || 0;
    const maxRiskIDR = m * r;
    const riskPerShare = e - s;

    if (riskPerShare <= 0 || e <= 0) {
      return {
        maxRiskIDR,
        riskPerShare,
        maxShares: 0,
        maxLot: 0,
        modalUsed: 0,
        pctOfModal: 0,
        riskPctEntry: 0,
      };
    }

    const maxShares = Math.floor(maxRiskIDR / riskPerShare);
    const maxLot = Math.floor(maxShares / 100);
    const actualShares = maxLot * 100;
    const modalUsed = actualShares * e;
    const pctOfModal = m > 0 ? (modalUsed / m) * 100 : 0;
    const riskPctEntry = e > 0 ? (riskPerShare / e) * 100 : 0;
    return { maxRiskIDR, riskPerShare, maxShares, maxLot, modalUsed, pctOfModal, riskPctEntry };
  }, [modal, riskPct, entry, stop]);

  return (
    <CalcScreen
      title="Berapa lot yang aman dibeli?"
      subtitle="Dengan risiko 1–2% modal per trade, kamu bisa salah berkali-kali tanpa rekening habis. Hitung lot maksimal sebelum entry."
    >
      <div className="calc-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 24 }}>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontSize: 16 }}>Setup Trade</h3>
          <NumberInput
            label="Total Modal"
            value={modal}
            onChange={setModal}
            prefix="Rp"
            hint={fmt.compact(modal) + ' rupiah'}
          />

          <div className="input-group">
            <label className="label">
              Risk per Trade <span className="muted">· max loss yg lo terima</span>
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              {[0.5, 1, 2, 3, 5].map((p) => (
                <button
                  key={p}
                  onClick={() => setRiskPct(p)}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    background: riskPct === p ? 'var(--primary)' : 'var(--surface-2)',
                    color: riskPct === p ? 'var(--primary-fg)' : 'var(--fg)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {p}%
                </button>
              ))}
            </div>
            <NumberInput value={riskPct} onChange={setRiskPct} suffix="%" />
          </div>

          <div className="divider" />
          <h4
            style={{
              fontSize: 14,
              color: 'var(--fg-muted)',
              fontWeight: 700,
              margin: 0,
            }}
          >
            Trade Plan
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <NumberInput label="Entry Price" value={entry} onChange={setEntry} prefix="Rp" />
            <NumberInput label="Stop Loss" value={stop} onChange={setStop} prefix="Rp" />
          </div>
          {result.riskPerShare > 0 && (
            <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
              Risk per lembar:{' '}
              <strong className="mono" style={{ color: 'var(--danger)' }}>
                −Rp {result.riskPerShare.toLocaleString('id-ID')}
              </strong>{' '}
              ({result.riskPctEntry.toFixed(2)}% dari entry)
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            className="card"
            style={{
              padding: 32,
              background:
                'linear-gradient(135deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 60%, #002518) 100%)',
              color: '#fff',
              border: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Icon name="shield" size={16} />
              <span
                style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', opacity: 0.9 }}
              >
                Amunisi maksimal
              </span>
            </div>
            <div
              className="mono tnum"
              style={{ fontSize: 60, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}
            >
              <AnimatedNumber value={result.maxLot} />{' '}
              <span style={{ fontSize: 24, opacity: 0.7 }}>lot</span>
            </div>
            <div style={{ fontSize: 14, opacity: 0.9, marginTop: 12 }}>
              {fmt.num(result.maxLot * 100)} lembar · Modal terpakai {fmt.rp(result.modalUsed)}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <ResultStat
              label="Max Risk"
              value={fmt.rp(result.maxRiskIDR)}
              hint={`${riskPct}% dari modal`}
            />
            <ResultStat
              label="% Modal Terpakai"
              value={result.pctOfModal.toFixed(1) + '%'}
              hint="Sisanya simpan"
            />
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div
              style={{
                fontSize: 12,
                color: 'var(--fg-muted)',
                fontWeight: 700,
                marginBottom: 12,
              }}
            >
              Komposisi Modal
            </div>
            <div
              style={{
                height: 32,
                background: 'var(--surface-2)',
                borderRadius: 999,
                overflow: 'hidden',
                display: 'flex',
              }}
            >
              <div
                style={{
                  width: Math.min(100, result.pctOfModal) + '%',
                  background: 'linear-gradient(90deg, var(--primary), var(--success))',
                  transition: 'width 0.4s cubic-bezier(.16,1,.3,1)',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 8,
                fontSize: 12,
              }}
            >
              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
                ● Trade aktif {result.pctOfModal.toFixed(1)}%
              </span>
              <span style={{ color: 'var(--fg-muted)', fontWeight: 700 }}>
                ○ Cash {(100 - result.pctOfModal).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </CalcScreen>
  );
}

/* ============================================================
   5. Dividen — net dividend yield (PPh Final 10%)
   ============================================================ */
function Dividen() {
  const [price, setPrice] = useStateC(11525);
  const [dps, setDps] = useStateC(220);
  const [lot, setLot] = useStateC(20);

  const result = useMemoC(() => {
    const p = Number(price) || 0;
    const d = Number(dps) || 0;
    const l = Number(lot) || 0;
    const shares = l * 100;
    const grossYieldPct = p > 0 ? (d / p) * 100 : 0;
    const grossDividend = d * shares;
    const tax = grossDividend * 0.10; // PPh Final 10%
    const netDividend = grossDividend - tax;
    const netYieldPct = p > 0 ? grossYieldPct * 0.9 : 0;
    const monthly = netDividend / 12;
    return { shares, grossYieldPct, grossDividend, tax, netDividend, netYieldPct, monthly };
  }, [price, dps, lot]);

  return (
    <CalcScreen
      title="Hitung dividen yang masuk rekening."
      subtitle="Yield bersih setelah PPh final 10%, plus simulasi kalau dividennya dibagi rata per bulan."
    >
      <div className="calc-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 24 }}>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h3 style={{ fontSize: 16 }}>Detail Saham</h3>
          <NumberInput
            label="Harga Saham"
            value={price}
            onChange={setPrice}
            prefix="Rp"
            hint="Harga saat ini per lembar"
          />
          <NumberInput
            label="Dividen per Lembar (DPS)"
            value={dps}
            onChange={setDps}
            prefix="Rp"
            hint="Dividend Per Share tahunan"
          />
          <NumberInput
            label="Jumlah Lot Dimiliki"
            value={lot}
            onChange={setLot}
            suffix="lot"
            hint={fmt.num(result.shares) + ' lembar'}
          />

          <div
            style={{
              background: 'var(--surface-2)',
              padding: 16,
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontWeight: 700 }}>
                Modal Awal
              </span>
              <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
                {fmt.rp(price * result.shares)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontWeight: 700 }}>
                Pajak Dividen (Final)
              </span>
              <span
                className="mono"
                style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}
              >
                10%
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            className="card"
            style={{
              padding: 32,
              background:
                'linear-gradient(135deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 60%, #002518) 100%)',
              color: '#fff',
              border: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Icon name="coin" size={16} />
              <span
                style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', opacity: 0.9 }}
              >
                NET YIELD · TAHUNAN
              </span>
            </div>
            <div
              className="mono tnum"
              style={{ fontSize: 60, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}
            >
              <AnimatedNumber value={result.netYieldPct} format={(n) => n.toFixed(2) + '%'} />
            </div>
            <div style={{ fontSize: 14, opacity: 0.9, marginTop: 12 }}>
              Gross yield {result.grossYieldPct.toFixed(2)}% · setelah PPh 10%
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <ResultStat label="Dividen Kotor /tahun" value={fmt.rp(result.grossDividend)} accent={false} />
            <ResultStat label="Pajak (10%)" value={fmt.rp(result.tax)} />
            <ResultStat label="Dividen Bersih /tahun" value={fmt.rp(result.netDividend)} accent />
            <ResultStat label="Estimasi /bulan" value={fmt.rp(result.monthly)} hint="Kalau dibagi rata" />
          </div>

          <div
            style={{
              background: 'var(--primary-soft)',
              padding: 18,
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <span style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }}>
              <Icon name="info" size={16} />
            </span>
            <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--fg)' }}>Catatan:</strong> Tarif PPh Final dividen orang
              pribadi dalam negeri = 10% (UU HPP). Jika diinvestasikan kembali sesuai PMK 18/2021,
              bisa 0% — konsultasikan ke broker / pajak ya.
            </div>
          </div>
        </div>
      </div>
      <DividendCalendar onPick={(p, d) => { setPrice(p); setDps(d); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
    </CalcScreen>
  );
}

/* ---------- Dividen 30 hari ke depan + kandidat capture ----------
   Riset train_anomalies.py (287 event yield >= 3%, 2022-2026): beli di close cum date,
   jual di close ex date, dividen tetap dibayar. Rata-rata +0,76%/event setelah pajak 10%
   dan fee 0,25%, positif 63% event, positif tiap tahun. Harga turun ~0,77x dividen di ex date. */
const CAPTURE_MIN_YIELD = 3;
const CAPTURE_MIN_VALUE = 5e9;   // universe riset: transaksi rata-rata >= Rp5 miliar/hari
const CAPTURE_MIN_PRICE = 100;

function parseDps(e) {
  const m = /Rp\s*([\d.,]+)/.exec(e.detail || '') || /Div\s+([\d.,]+)/.exec(e.summary || '');
  if (!m) return null;
  const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

function DividendCalendar({ onPick }) {
  const [rows, setRows] = useStateC(null);
  const [error, setError] = useStateC(null);

  useEffectC(() => {
    let alive = true;
    fetch('/calendar?range=upcoming&type=corporate')
      .then((r) => r.json())
      .then(async (cal) => {
        const events = (cal.events || [])
          .filter((e) => e.label === 'Dividen' && e.eventType === 'cum' && /^[A-Z]{4}$/.test(e.ticker || ''))
          .map((e) => ({ ticker: e.ticker, name: e.securityName, cum: e.date, days: e.daysUntil, dps: parseDps(e) }))
          .filter((e) => e.dps);
        // server baru nyala: cache KSEI masih dimuat → jangan bilang "tidak ada jadwal"
        if (!events.length && cal.error) { if (alive) setError(cal.error); return; }
        const tickers = [...new Set(events.map((e) => e.ticker))].slice(0, 50);
        const q = tickers.length ? await fetch('/watchlist?tickers=' + tickers.join(',')).then((r) => r.json()) : {};
        const list = events
          .map((e) => {
            const quote = q.quotes?.[e.ticker] || {};
            const price = quote.price;
            return { ...e, price, value: quote.value, yld: price ? (e.dps / price) * 100 : null };
          })
          .sort((a, b) => a.cum.localeCompare(b.cum) || (b.yld || 0) - (a.yld || 0));
        if (alive) setRows(list);
      })
      .catch(() => { if (alive) setError('Jadwal dividen belum bisa dimuat. Coba lagi nanti.'); });
    return () => { alive = false; };
  }, []);

  const day = (s) => new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  const num = (v, d = 0) => v.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const th = { padding: '10px 12px 6px', fontWeight: 600, fontSize: 13, color: 'var(--fg-muted)', textAlign: 'right', whiteSpace: 'nowrap' };
  const td = { padding: 12, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--fg)', whiteSpace: 'nowrap' };

  return (
    <section aria-labelledby="div-cal" style={{ marginTop: 48 }}>
      <h2 id="div-cal" style={{ margin: 0, fontSize: 28, letterSpacing: '-0.02em' }}>Dividen 30 hari ke depan</h2>
      <p style={{ margin: '8px 0 0', maxWidth: '72ch', color: 'var(--fg-muted)', fontSize: 15, lineHeight: 1.6 }}>
        Untuk saham likuid (transaksi rata-rata Rp5 miliar per hari ke atas) dengan yield {CAPTURE_MIN_YIELD}% ke atas ada pola
        yang konsisten: beli di harga penutupan cum date, jual di penutupan
        hari berikutnya (ex date), dan dividennya tetap dibayar ke kamu. Harga biasanya turun sekitar 0,77 kali dividen,
        lebih kecil dari dividen bersih setelah pajak. Dari 287 event 2022 sampai 2026, hasilnya rata-rata +0,76% per event
        setelah pajak 10% dan fee 0,25%. Sebanyak 37% event tetap rugi, jadi ini peluang, bukan jaminan.
      </p>

      {error && <p role="alert" style={{ marginTop: 16, color: 'var(--danger)' }}>{error}</p>}
      {!rows && !error && <p style={{ marginTop: 16, color: 'var(--fg-muted)' }}>Memuat jadwal dividen dari KSEI...</p>}
      {rows && rows.length === 0 && (
        <p style={{ marginTop: 16, color: 'var(--fg-muted)' }}>Belum ada jadwal dividen tunai dalam 30 hari ke depan.</p>
      )}

      {rows && rows.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 16 }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
            <caption style={{ position: 'absolute', left: -9999 }}>Jadwal dividen tunai 30 hari ke depan dan yield dari harga terakhir</caption>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--fg)' }}>
                <th scope="col" style={{ ...th, textAlign: 'left', paddingLeft: 0 }}>Saham</th>
                <th scope="col" style={th}>Cum date</th>
                <th scope="col" style={th}>Dividen/lembar</th>
                <th scope="col" style={th}>Harga</th>
                <th scope="col" style={th}>Yield</th>
                <th scope="col" style={{ ...th, textAlign: 'left' }}>Capture</th>
                <th scope="col" style={{ ...th, paddingRight: 0 }}><span style={{ position: 'absolute', left: -9999 }}>Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const highYield = r.yld != null && r.yld >= CAPTURE_MIN_YIELD;
                const liquid = (r.value || 0) >= CAPTURE_MIN_VALUE && r.price >= CAPTURE_MIN_PRICE;
                const candidate = highYield && liquid;
                const status = r.yld == null ? 'Harga belum ada' : !highYield ? 'Yield terlalu kecil' : !liquid ? 'Kurang likuid' : 'Kandidat';
                return (
                  <tr key={r.ticker + r.cum} style={{ borderTop: '1px solid var(--border)' }}>
                    <th scope="row" style={{ textAlign: 'left', padding: '12px 12px 12px 0', fontWeight: 800, color: 'var(--fg)' }}>
                      {r.ticker}
                      <div style={{ fontWeight: 400, fontSize: 12, color: 'var(--fg-muted)' }}>{r.name}</div>
                    </th>
                    <td style={td}>
                      {day(r.cum)}
                      <div style={{ fontFamily: 'inherit', fontSize: 12, color: 'var(--fg-muted)' }}>
                        {r.days === 0 ? 'hari ini' : r.days === 1 ? 'besok' : `${r.days} hari lagi`}
                      </div>
                    </td>
                    <td style={td}>Rp{num(r.dps, r.dps % 1 ? 2 : 0)}</td>
                    <td style={td}>{r.price ? num(r.price) : '–'}</td>
                    <td style={{ ...td, fontWeight: candidate ? 800 : 400 }}>{r.yld != null ? num(r.yld, 1) + '%' : '–'}</td>
                    <td style={{ ...td, textAlign: 'left', fontFamily: 'inherit', color: candidate ? 'var(--success)' : 'var(--fg-muted)' }}>
                      {status}
                    </td>
                    <td style={{ ...td, paddingRight: 0 }}>
                      {r.price && (
                        <button type="button" className="btn btn-secondary" style={{ minHeight: 36, padding: '0 12px', fontSize: 13 }} onClick={() => onPick(r.price, r.dps)}>
                          Hitung
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

Object.assign(window, { AveragePrice, ARAARB, ProfitCalc, Amunisi, Dividen });
