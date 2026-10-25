/**
 * build-bundle.js — production build.
 *
 * The frontend is intentionally NOT ES-module based: each script shares
 * globals via `window` and function hoisting, loaded in order into one global
 * scope. So instead of module bundling we transform each file JSX->JS with
 * esbuild (classic React runtime) and concatenate them in the exact load order
 * into a single bundle. Production then loads React (minified) + that one
 * bundle, dropping the ~2 MB Babel Standalone CDN and the per-file in-browser
 * compile that runs on every page load.
 *
 * Output: dist/ (bundle + rewritten index.html + server + assets).
 * Dev stays on the root index.html with in-browser Babel for fast iteration.
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

// Bundle inti: cukup untuk halaman depan. app.jsx terakhir karena langsung render.
const CORE_ORDER = [
  'js/cuanmeter/components.jsx',
  'js/cuanmeter/watchlist.jsx',
  'js/cuanmeter/tradingview.jsx',
  'js/cuanmeter/landing.jsx',
  'js/cuanmeter/heatmap.jsx',
  'js/cuanmeter/app.jsx',
];

// Halaman lain (~45% kode): dimuat app.jsx (loadPages) setelah halaman depan tampil.
// File inti hanya memakai global dari sini saat render route-nya, tidak saat dimuat.
const PAGES_ORDER = [
  'js/cuanmeter/calculators.jsx',
  'js/cuanmeter/analyzer.jsx',
  'js/cuanmeter/guides.jsx',
  'js/cuanmeter/risk.jsx',
  'js/cuanmeter/papertrade.jsx',
  'js/cuanmeter/arena-utils.js',
  'js/cuanmeter/arena-market.js',
  'js/cuanmeter/arena-engine.js',
  'js/cuanmeter/arena-agents.js',
  'js/cuanmeter/arena-flow.js',
  'js/cuanmeter/arena-bots.js',
  'js/cuanmeter/arena-store.jsx',
  'js/cuanmeter/arena.jsx',
];

const BUNDLE_REL = 'js/cuanmeter/app.bundle.js';
const PAGES_REL = 'js/cuanmeter/pages.bundle.js'; // sama dengan PAGES_BUNDLE di app.jsx

// Files/dirs copied verbatim into dist so `node dist/server.js` runs the build.
const COPY_ENTRIES = [
  'CSS',
  'favicon.svg',
  'robots.txt',
  'sitemap.xml',
  'server.js',
  'ipo-utils.js',
  'ipo_scrape.py',
  'predict.py',
  'screener.py',
  'heatmap.py',
  'watchlist.py',
  'fundamentals.py',
  'dividend_history.py',
  'portfolio.py',
  'data',
];

function transformOne(relPath) {
  const source = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
  const result = esbuild.transformSync(source, {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    // Strip whitespace + simplify syntax, but DO NOT mangle identifiers: these
    // files share globals by name across the concatenated bundle (window
    // exposure, function hoisting), so renaming would break cross-file refs.
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: false,
    target: 'es2019',
  });
  if (result.warnings && result.warnings.length) {
    for (const w of result.warnings) console.warn(`[build] ${relPath}: ${w.text}`);
  }
  return result.code;
}

// React UMD (devDependency, versi sama dengan dev index.html) ikut di awal bundle: satu file
// dari origin sendiri, tanpa koneksi DNS+TLS tambahan ke unpkg sebelum halaman bisa tampil.
const REACT_UMD = [
  'node_modules/react/umd/react.production.min.js',
  'node_modules/react-dom/umd/react-dom.production.min.js',
];

function concat(order) {
  const parts = [];
  for (const rel of order) {
    parts.push(`/* ${rel} */`);
    parts.push(transformOne(rel));
    parts.push(';'); // ASI safety between concatenated files
  }
  return parts.join('\n');
}

// React + inti dalam satu file; halaman lain terpisah.
function buildBundle() {
  const react = REACT_UMD.map((rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8') + '\n;').join('\n');
  return { core: react + '\n' + concat(CORE_ORDER), pages: concat(PAGES_ORDER) };
}

function buildIndexHtml() {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  // Replace the React-dev + Babel + per-file babel scripts with a single
  // production bundle plus minified React.
  const start = html.indexOf('  <script src="https://unpkg.com/react@');
  const bodyEnd = html.indexOf('</body>');
  if (start === -1 || bodyEnd === -1) {
    throw new Error('index.html script block markers not found');
  }
  const head = html.slice(0, start);
  const tail = html.slice(bodyEnd);
  const prodScripts = [
    // Link langsung ke halaman lain (#profit): unduh bundle halaman bersamaan dengan bundle inti.
    `  <script>if (/^#(?!home$)./.test(location.hash)) { var l = document.createElement('link'); l.rel = 'preload'; l.as = 'script'; l.href = '${PAGES_REL}'; document.head.appendChild(l); }</script>`,
    `  <script src="${BUNDLE_REL}"></script>`, // React sudah di dalam bundle (REACT_UMD)
    '',
  ].join('\n');
  return head + prodScripts + tail;
}

function writeBundles(outDir) {
  const { core, pages } = buildBundle();
  fs.mkdirSync(path.join(outDir, path.dirname(BUNDLE_REL)), { recursive: true });
  fs.writeFileSync(path.join(outDir, BUNDLE_REL), core);
  fs.writeFileSync(path.join(outDir, PAGES_REL), pages);
  const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0);
  console.log(`[build] ${BUNDLE_REL} (${kb(core)} KB) + ${PAGES_REL} (${kb(pages)} KB)`);
}

function copyAssets() {
  for (const entry of COPY_ENTRIES) {
    const source = path.join(rootDir, entry);
    if (!fs.existsSync(source)) continue;
    fs.cpSync(source, path.join(distDir, entry), {
      recursive: true,
      filter: (src) => {
        const base = path.basename(src);
        return !base.endsWith('.pkl') && base !== '__pycache__';
      },
    });
  }
}

function build() {
  fs.rmSync(distDir, { recursive: true, force: true });
  writeBundles(distDir);
  copyAssets();
  fs.writeFileSync(path.join(distDir, 'index.html'), buildIndexHtml());
  console.log(`[build] Output: ${distDir}`);
  console.log('[build] Run: node dist/server.js');
}

// build-static.js (Vercel) reuses the bundle + production index.html.
module.exports = { writeBundles, buildIndexHtml };

if (require.main === module) build();
