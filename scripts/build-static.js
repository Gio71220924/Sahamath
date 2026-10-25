/**
 * build-static.js — frontend statis untuk Vercel (vercel.json → dist/).
 *
 * Sama dengan build-bundle.js tapi tanpa file server: JSX dikompilasi sekali
 * jadi satu bundle + React production, jadi browser tidak perlu Babel
 * Standalone (~2 MB) dan tidak mengompilasi 19 file tiap buka halaman.
 */
const fs = require('fs');
const path = require('path');
const { writeBundles, buildIndexHtml } = require('./build-bundle');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const ASSETS = ['CSS', 'favicon.svg', 'robots.txt', 'sitemap.xml'];

fs.rmSync(distDir, { recursive: true, force: true });

for (const entry of ASSETS) {
  const source = path.join(rootDir, entry);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(distDir, entry), { recursive: true });
}

writeBundles(distDir);
fs.writeFileSync(path.join(distDir, 'index.html'), buildIndexHtml());
console.log(`[Build] Static frontend -> ${distDir}`);
