/* ============================================================
   heatmap.jsx — Sector treemap (squarified, no dependency).
   ============================================================ */

const { useState: useStateH, useEffect: useEffectH, useRef: useRefH, useMemo: useMemoH } = React;

/* ---------- Ticker → TradingView logo slug (verified against CDN) ----------
   Missing tickers (GOTO, TLKM, JECC) gracefully fall back to text-only. */
const TICKER_LOGO = {
  BYAN: 'bayan-resources-tbk', ADRO: 'adaro-energy-tbk', PTBA: 'bukit-asam-tbk',
  ITMG: 'indo-tambangraya-megah', MEDC: 'medco-energi', PGAS: 'perusahaan-gas-negara',
  BRPT: 'barito-pacific', TPIA: 'chandra-asri', ANTM: 'antam', INCO: 'vale',
  MDKA: 'merdeka-copper-gold', INKP: 'indah-kiat-pulp-and-paper',
  ASII: 'astra-international', UNTR: 'united-tractors', ARNA: 'arwana-citramulia-tbk',
  KRAS: 'krakatau-steel-persero', MARK: 'mark-dynamics-indonesia',
  UNVR: 'unilever', ICBP: 'indofood-cbp', INDF: 'indofood', AMRT: 'sumber-alfaria-trijaya',
  CPIN: 'charoen-pokphand-indonesia', GGRM: 'gudang-garam-tbk',
  MAPI: 'mitra-adiperkasa', ACES: 'ace-hardware', ERAA: 'erajaya-swasembada',
  MNCN: 'media-nusantara-citra-tbk', SCMA: 'surya-citra-media', LPPF: 'matahari-department-store-tbk',
  KLBF: 'kalbe-farma', SIDO: 'sido-muncul', MIKA: 'mitra-keluarga-karyasehat',
  SILO: 'siloam-international-hospitals-tbk', HEAL: 'medikaloka-hermina-tbk', PRDA: 'prodia-widyahusada',
  BBCA: 'bank-central-asia', BBRI: 'bank-rakyat-indonesia', BMRI: 'bank-mandiri',
  BBNI: 'bank-negara-indonesia-persero-tbk', BRIS: 'bank-syariah-indonesia', ARTO: 'bank-jago-tbk',
  PANI: 'pantai-indah-kapuk-dua-tbk', BSDE: 'bumi-serpong-damai', CTRA: 'ciputra-development',
  PWON: 'pakuwon-jati', SMRA: 'summarecon-agung', DMAS: 'puradelta-lestari',
  DCII: 'dci-indonesia-tbk', BUKA: 'bukalapak', EMTK: 'elang-mahkota-teknologi-tbk',
  MTDL: 'metrodata-electronics', WIFI: 'solusi-sinergi-digital-tbk',
  TOWR: 'sarana-menara-nusantara', JSMR: 'jasa-marga-persero', MTEL: 'dayamitra-telekomunikasi',
  ISAT: 'indosat', EXCL: 'xl-axiata-tbk',
  ASSA: 'adi-sarana-armada-tbk', BIRD: 'blue-bird', SMDR: 'samudera-indonesia',
  TMAS: 'temas', WEHA: 'weha-transportasi-indonesia-tbk', HATM: 'habco-trans-maritima-tbk',
};

/* ---------- Brand-colored initial badges for tickers absent from TradingView CDN ---------- */
function makeBadge(text, bg) {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="${bg}"/><text x="10" y="14" text-anchor="middle" font-size="7.5" font-weight="800" font-family="sans-serif" fill="#fff">${text}</text></svg>`
  )}`;
}
const TICKER_BADGE = {
  GOTO: makeBadge('GT', '#00AA13'),
  TLKM: makeBadge('TL', '#CC0000'),
  JECC: makeBadge('JC', '#0B6E4F'),
};

/* Logo URL for a ticker (TradingView slug, brand badge, or null) — reused by watchlist. */
function logoSrcFor(ticker) {
  const slug = TICKER_LOGO[ticker];
  return slug ? `https://s3-symbol-logo.tradingview.com/${slug}.svg` : (TICKER_BADGE[ticker] || null);
}

/* ---------- Squarified treemap layout ----------
   data: [{ value, ... }]  → returns [{ data, x, y, w, h }] in pixels. */
function squarify(data, x, y, w, h) {
  const items = data.filter((d) => d.value > 0).slice().sort((a, b) => b.value - a.value);
  const result = [];
  if (!items.length || w <= 0 || h <= 0) return result;

  const worstRatio = (row, length, scale) => {
    const areas = row.map((r) => r.value * scale);
    const sum = areas.reduce((s, a) => s + a, 0);
    const maxA = Math.max(...areas);
    const minA = Math.min(...areas);
    const sum2 = sum * sum;
    const len2 = length * length;
    return Math.max((len2 * maxA) / sum2, sum2 / (len2 * minA));
  };

  let rect = { x, y, w, h };
  let i = 0;
  while (i < items.length) {
    const remaining = items.slice(i);
    const remTotal = remaining.reduce((s, d) => s + d.value, 0);
    const scale = (rect.w * rect.h) / remTotal; // px per value unit
    const length = Math.min(rect.w, rect.h);    // tile along shorter side

    let row = [items[i]];
    let j = i + 1;
    while (j < items.length) {
      const next = row.concat(items[j]);
      if (worstRatio(next, length, scale) > worstRatio(row, length, scale)) break;
      row = next;
      j++;
    }

    const rowValue = row.reduce((s, d) => s + d.value, 0);
    const thickness = (rowValue * scale) / length; // band depth
    let offset = 0;

    if (rect.w >= rect.h) {
      // vertical column of width `thickness` on the left
      for (const d of row) {
        const cellH = (d.value * scale) / thickness;
        result.push({ data: d, x: rect.x, y: rect.y + offset, w: thickness, h: cellH });
        offset += cellH;
      }
      rect = { x: rect.x + thickness, y: rect.y, w: rect.w - thickness, h: rect.h };
    } else {
      // horizontal band of height `thickness` on top
      for (const d of row) {
        const cellW = (d.value * scale) / thickness;
        result.push({ data: d, x: rect.x + offset, y: rect.y, w: cellW, h: thickness });
        offset += cellW;
      }
      rect = { x: rect.x, y: rect.y + thickness, w: rect.w, h: rect.h - thickness };
    }
    i = j;
  }
  return result;
}

/* ---------- Color scale: red ↔ gray ↔ green, clamp ±4% ---------- */
function mixRGB(a, b, t) {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
function colorFor(pct, range = 4) {
  const GRAY = [120, 120, 128];
  const GREEN = [0, 168, 107];
  const RED = [220, 52, 52];
  const r = range > 0 ? range : 4;
  const t = Math.max(-r, Math.min(r, pct)) / r; // -1..1; 0 selalu abu (sign terjaga)
  return t >= 0 ? mixRGB(GRAY, GREEN, t) : mixRGB(GRAY, RED, -t);
}
function textOn(rgbStr) {
  const m = rgbStr.match(/\d+/g).map(Number);
  const lum = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255;
  return lum > 0.6 ? '#0b0b0c' : '#ffffff';
}
function fmtMcap(v) {
  if (v >= 1e12) return (v / 1e12).toFixed(1).replace('.', ',') + ' T';
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace('.', ',') + ' M';
  return v.toLocaleString('id-ID');
}

/* ---------- One stock tile ---------- */
function Tile({ stock, x, y, w, h, onSelect, range, tf }) {
  const pv = stock[tf];
  const pct = pv == null ? 0 : pv;
  const bg = colorFor(pct, range);
  const small = w < 46 || h < 30;
  const sign = pv != null && pv >= 0 ? '+' : '';
  const pctText = pv == null ? '—' : `${sign}${pv}%`;
  const slug = TICKER_LOGO[stock.ticker];
  const logoSrc = slug ? `https://s3-symbol-logo.tradingview.com/${slug}.svg` : TICKER_BADGE[stock.ticker];
  const showLogo = logoSrc && w >= 52 && h >= 48;
  const logoSize = Math.min(64, Math.max(22, Math.round(Math.min(w, h) * 0.42)));
  return (
    <button
      type="button"
      className="heatmap-tile"
      style={{ left: x, top: y, width: w, height: h, background: bg, color: textOn(bg) }}
      onClick={() => onSelect(stock)}
      title={`${stock.ticker} · ${pctText} · Rp ${stock.price.toLocaleString('id-ID')}`}
    >
      {!small && (
        <span className="heatmap-tile-label">
          {showLogo && (
            <img
              className="heatmap-tile-logo"
              src={logoSrc}
              alt=""
              width={logoSize}
              height={logoSize}
              loading="lazy"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
          <strong>{stock.ticker}</strong>
          <span>{pctText}</span>
        </span>
      )}
    </button>
  );
}

/* ---------- One sector block (header + nested stock tiles) ---------- */
function SectorBlock({ sector, x, y, w, h, onSelect, range, tf }) {
  const HEADER = 18;
  const PAD = 2;
  const innerH = Math.max(0, h - HEADER - PAD);
  const innerW = Math.max(0, w - PAD * 2);
  const tiles = useMemoH(
    () => squarify(sector.stocks.map((st) => ({ stock: st, value: st.mcap })), 0, 0, innerW, innerH),
    [sector, innerW, innerH]
  );
  let wSum = 0, mSum = 0;
  for (const st of sector.stocks) {
    if (st[tf] == null) continue;
    wSum += st[tf] * st.mcap;
    mSum += st.mcap;
  }
  const sectorPct = mSum > 0 ? wSum / mSum : 0;
  // warna tema, bukan hijau/merah muda tetap: label sektor ada di latar putih pada tema terang
  const pctColor = sectorPct > 0.05 ? 'var(--success)' : sectorPct < -0.05 ? 'var(--danger)' : 'var(--fg-muted)';
  return (
    <div className="heatmap-sector" style={{ left: x, top: y, width: w, height: h }}>
      <div className="heatmap-sector-label">
        <span className="heatmap-sector-name">{sector.name}</span>
        {w >= 90 && (
          <span className="heatmap-sector-pct" style={{ color: pctColor }}>
            {sectorPct >= 0 ? '+' : ''}{sectorPct.toFixed(2)}%
          </span>
        )}
      </div>
      <div className="heatmap-sector-inner" style={{ top: HEADER, left: PAD, width: innerW, height: innerH }}>
        {tiles.map(({ data, x: sx, y: sy, w: sw, h: sh }) => (
          <Tile key={data.stock.ticker} stock={data.stock} x={sx} y={sy} w={sw} h={sh} onSelect={(stk) => onSelect(stk, sector.name)} range={range} tf={tf} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Treemap canvas (measures itself, lays out sectors) ---------- */
function Treemap({ sectors, onSelect, range, tf }) {
  const ref = useRefH(null);
  const [size, setSize] = useStateH({ w: 0, h: 0 });

  useEffectH(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rects = useMemoH(() => {
    if (!size.w || !size.h) return [];
    const items = sectors.map((s) => ({
      sector: s,
      value: s.stocks.reduce((sum, st) => sum + st.mcap, 0),
    }));
    return squarify(items, 0, 0, size.w, size.h);
  }, [sectors, size]);

  return (
    <div ref={ref} className="heatmap-canvas">
      {rects.map(({ data, x, y, w, h }) => (
        <SectorBlock key={data.sector.code} sector={data.sector} x={x} y={y} w={w} h={h} onSelect={onSelect} range={range} tf={tf} />
      ))}
    </div>
  );
}

/* ---------- Color legend ---------- */
function HeatmapLegend({ range = 4 }) {
  const stops = [-range, -range / 2, 0, range / 2, range];
  return (
    <div className="heatmap-legend">
      <span className="heatmap-legend-cap">-{range}%</span>
      <div className="heatmap-legend-bar">
        {stops.map((p, i) => (
          <span key={i} style={{ background: colorFor(p, range) }} />
        ))}
      </div>
      <span className="heatmap-legend-cap">+{range}%</span>
    </div>
  );
}

/* ---------- Page ---------- */
const TIMEFRAMES = [['1D', 'd1'], ['1W', 'w1'], ['1M', 'm1'], ['YTD', 'ytd']];

/* Shared: timeframe pill toggle (used by page + home preview) */
function TimeframeToggle({ tf, setTf }) {
  return (
    <div className="heatmap-tf-toggle">
      {TIMEFRAMES.map(([label, key]) => (
        <button type="button" key={key} className={`strategy-mode-btn${tf === key ? ' active' : ''}`} onClick={() => setTf(key)}>{label}</button>
      ))}
    </div>
  );
}

/* Shared: floating detail card on tile tap (used by page + home preview) */
function HeatmapDetailCard({ picked, tf, onClose, onNavigate }) {
  const st = picked.stock;
  const slug = TICKER_LOGO[st.ticker];
  const logoSrc = slug ? `https://s3-symbol-logo.tradingview.com/${slug}.svg` : TICKER_BADGE[st.ticker];
  const tfColor = (v) => v == null ? 'var(--fg-faint)' : v > 0.05 ? 'var(--primary)' : v < -0.05 ? 'var(--danger)' : 'var(--fg-muted)';
  const fmtPct = (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v}%`;
  return (
    <div className="heatmap-detail">
      <div className="heatmap-detail-main">
        {logoSrc && (
          <img className="heatmap-detail-logo" src={logoSrc} alt="" width={36} height={36} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        )}
        <div>
          <div className="heatmap-detail-ticker">
            {st.ticker} <span className="heatmap-detail-sector">{picked.sectorName}</span>
          </div>
          <div className="heatmap-detail-stats">
            <span>Rp {st.price.toLocaleString('id-ID')}</span>
            <span>Cap {fmtMcap(st.mcap)}</span>
          </div>
          <div className="heatmap-detail-tfs">
            {TIMEFRAMES.map(([label, key]) => (
              <span key={key} className={`heatmap-detail-tf${tf === key ? ' active' : ''}`}>
                <span className="heatmap-detail-tf-label">{label}</span>
                <strong style={{ color: tfColor(st[key]) }}>{fmtPct(st[key])}</strong>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="heatmap-detail-actions">
        <button type="button" className="btn btn-primary" onClick={() => onNavigate && onNavigate('analyzer', st.ticker)}>
          Buka Analyzer →
        </button>
        <button type="button" className="heatmap-detail-close" onClick={onClose} aria-label="Tutup">×</button>
      </div>
    </div>
  );
}

function HeatmapPage({ onNavigate }) {
  const [data, setData] = useStateH(null);
  const [loading, setLoading] = useStateH(true);
  const [error, setError] = useStateH(null);
  const [adaptive, setAdaptive] = useStateH(false);
  const [picked, setPicked] = useStateH(null);
  const [tf, setTf] = useStateH('d1');

  const load = () => {
    setLoading(true);
    setError(null);
    fetch('/heatmap')
      .then((r) => r.json())
      .then((d) => {
        if (d.status === 'ok') setData(d);
        else setError(d.message || 'Gagal memuat heatmap');
        setLoading(false);
      })
      .catch(() => {
        setError('Gagal menghubungi server');
        setLoading(false);
      });
  };
  useEffectH(() => { load(); }, []);

  const ts = data
    ? new Date(data.generated_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : null;

  const maxAbs = data
    ? data.sectors.reduce((m, s) => s.stocks.reduce((mm, st) => (st[tf] == null ? mm : Math.max(mm, Math.abs(st[tf]))), m), 0)
    : 0;
  const range = adaptive ? Math.max(2, Math.ceil(maxAbs)) : 4;

  const pick = (stock, sectorName) => setPicked({ stock, sectorName });

  return (
    <CalcScreen
      title="Heatmap sektor IDX."
      subtitle="Besar kotak menunjukkan market cap, warnanya perubahan harga sesuai timeframe. Ketuk saham untuk detail."
    >
      <div className="heatmap-toolbar">
        <div className="heatmap-toolbar-left">
          <TimeframeToggle tf={tf} setTf={setTf} />
          <HeatmapLegend range={range} />
        </div>
        <div className="heatmap-toolbar-right">
          <div className="heatmap-scale-toggle">
            <span className="heatmap-scale-label">Skala</span>
            <button className={`strategy-mode-btn${!adaptive ? ' active' : ''}`} onClick={() => setAdaptive(false)}>Tetap</button>
            <button className={`strategy-mode-btn${adaptive ? ' active' : ''}`} onClick={() => setAdaptive(true)}>Adaptif</button>
          </div>
          {data && data.total != null && (
            <span className="heatmap-ts" style={{ color: data.shown < data.total ? 'var(--warning)' : 'var(--fg-muted)' }}>
              {data.shown}/{data.total} saham
            </span>
          )}
          {ts && <span className="heatmap-ts">data per {ts}</span>}
          <button onClick={load} disabled={loading} className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 14px', opacity: loading ? 0.5 : 1 }}>
            {loading ? 'Memuat...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="heatmap-error">{error} — coba klik Refresh.</div>
      )}

      {loading && !data && (
        <div className="heatmap-canvas heatmap-skeleton" />
      )}

      {data && <Treemap sectors={data.sectors} onSelect={pick} range={range} tf={tf} />}

      {picked && <HeatmapDetailCard picked={picked} tf={tf} onClose={() => setPicked(null)} onNavigate={onNavigate} />}
    </CalcScreen>
  );
}

/* ---------- Home preview: compact, lite-interactive, links to full page ---------- */
function HeatmapPreview({ onNavigate }) {
  const [data, setData] = useStateH(null);
  const [tf, setTf] = useStateH('d1');
  const [picked, setPicked] = useStateH(null);

  useEffectH(() => {
    let alive = true;
    fetch('/heatmap')
      .then((r) => r.json())
      .then((d) => { if (alive && d.status === 'ok') setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!data) return null; // teaser: muncul hanya saat data siap (cache instan)

  const pick = (stock, sectorName) => setPicked({ stock, sectorName });
  const goFull = () => onNavigate && onNavigate('heatmap');

  return (
    <section className="heatmap-preview" style={{ padding: '80px 0' }}>
      <div className="container">
        <SectionTitle title="Sektor mana yang panas hari ini" sub="Besar kotak menunjukkan market cap, warnanya perubahan harga. Ketuk saham untuk detail." />

        <div className="heatmap-preview-toolbar">
          <TimeframeToggle tf={tf} setTf={setTf} />
          <HeatmapLegend range={4} />
        </div>

        <Treemap sectors={data.sectors} onSelect={pick} range={4} tf={tf} />

        <button type="button" className="btn btn-primary heatmap-preview-cta" onClick={goFull}>
          Lihat heatmap lengkap
        </button>

        {picked && <HeatmapDetailCard picked={picked} tf={tf} onClose={() => setPicked(null)} onNavigate={onNavigate} />}
      </div>
    </section>
  );
}

Object.assign(window, { Treemap, colorFor, squarify, HeatmapPage, HeatmapPreview, logoSrcFor });
