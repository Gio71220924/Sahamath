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

// Exact load order from index.html (React/Babel CDN tags excluded).
const SCRIPT_ORDER = [
  'js/cuanmeter/components.jsx',
  'js/cuanmeter/watchlist.jsx',
  'js/cuanmeter/tradingview.jsx',
  'js/cuanmeter/landing.jsx',
  'js/cuanmeter/calculators.jsx',
  'js/cuanmeter/analyzer.jsx',
  'js/cuanmeter/guides.jsx',
  'js/cuanmeter/heatmap.jsx',
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
  'js/cuanmeter/app.jsx',
];

const BUNDLE_REL = 'js/cuanmeter/app.bundle.js';

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

function buildBundle() {
  const parts = [];
  for (const rel of SCRIPT_ORDER) {
    parts.push(`/* ${rel} */`);
    parts.push(transformOne(rel));
    parts.push(';'); // ASI safety between concatenated files
  }
  return parts.join('\n');
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
    '  <script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" crossorigin="anonymous"></script>',
    '  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" crossorigin="anonymous"></script>',
    `  <script src="${BUNDLE_REL}"></script>`,
    '',
  ].join('\n');
  return head + prodScripts + tail;
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
  fs.mkdirSync(path.join(distDir, path.dirname(BUNDLE_REL)), { recursive: true });

  const bundle = buildBundle();
  fs.writeFileSync(path.join(distDir, BUNDLE_REL), bundle);

  copyAssets();
  fs.writeFileSync(path.join(distDir, 'index.html'), buildIndexHtml());

  const kb = (Buffer.byteLength(bundle) / 1024).toFixed(0);
  console.log(`[build] Bundle: ${SCRIPT_ORDER.length} files -> ${BUNDLE_REL} (${kb} KB)`);
  console.log(`[build] Output: ${distDir}`);
  console.log('[build] Run: node dist/server.js');
}

// build-static.js (Vercel) reuses the bundle + production index.html.
module.exports = { buildBundle, buildIndexHtml, BUNDLE_REL };

if (require.main === module) build();
