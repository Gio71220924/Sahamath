/**
 * Fixture bersama tes e2e: memalsukan semua endpoint API dengan data tetap, memblokir domain luar
 * (TradingView, Railway SSE, font), dan menggagalkan tes kalau halaman melempar error JavaScript.
 */
const base = require('@playwright/test');

// Kalender: dividen dengan tiga status berbeda (lihat CAPTURE_* di calculators.jsx).
const CAL_EVENTS = [
  { id: 'cum-AAAA', date: '2030-01-15', daysUntil: 1, category: 'corporate', label: 'Dividen', eventType: 'cum', ticker: 'AAAA', securityName: 'PT AAAA Tbk', summary: 'Div 60 rupiah/lembar', impact: 'high' },
  { id: 'cum-BBBB', date: '2030-01-16', daysUntil: 2, category: 'corporate', label: 'Dividen', eventType: 'cum', ticker: 'BBBB', securityName: 'PT BBBB Tbk', summary: 'Div 5 rupiah/lembar', impact: 'high' },
  { id: 'cum-CCCC', date: '2030-01-17', daysUntil: 3, category: 'corporate', label: 'Dividen', eventType: 'cum', ticker: 'CCCC', securityName: 'PT CCCC Tbk', summary: 'Div 20 rupiah/lembar', impact: 'high' },
];

const API = {
  '/calendar': { status: 'success', generated_at: '2030-01-14T03:00:00.000Z', cached: true, error: null, range_start: '2030-01-14', range_end: '2030-02-13', events: CAL_EVENTS },
  // AAAA: yield 6%, likuid → Kandidat. BBBB: yield 1% → terlalu kecil. CCCC: yield 10% tapi transaksi Rp1 M/hari → kurang likuid.
  '/watchlist': { quotes: {
    AAAA: { price: 1000, pct: 1.2, value: 1e10, spark: [990, 995, 1000] },
    BBBB: { price: 500, pct: -0.5, value: 1e10, spark: [505, 502, 500] },
    CCCC: { price: 200, pct: 0, value: 1e9, spark: [200, 200, 200] },
  } },
  '/dividend-history': { status: 'ok', ticker: 'AAAA', events: [
    { ex: '2028-06-10', cum_close: 1000, ex_close: 900, amount: 60 },   // (900×0,9975 + 54) / 1.001,5 − 1 = −4,97%
    { ex: '2029-06-10', cum_close: 1000, ex_close: 950, amount: 60 },   // (950×0,9975 + 54) / 1.001,5 − 1 = +0,01%
  ] },
  '/ml-predict': { status: 'error', message: 'Kode XXXX tidak ditemukan di BEI. Periksa lagi kodenya.' },
  '/fundamentals': { status: 'error', message: 'tidak tersedia di tes' },
  '/ai-analysis': { status: 'error', message: 'tidak tersedia di tes' },
  '/heatmap': { status: 'error' },
  '/ipo-news': { status: 'error' },
  '/search': { results: [] },
  '/board': { status: 'error' },
  '/price': { status: 'error' },
  '/portfolio': { status: 'error', message: 'tidak tersedia di tes' },
};

const test = base.test.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost') return route.abort();
      const body = API[url.pathname];
      if (body) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      return route.continue();
    });
    await use(page);
    base.expect(errors, 'error JavaScript di halaman').toEqual([]);
  },
});

/** Ganti isi kolom angka seperti mengetik: kosongkan, ketik, lalu keluar dari kolom. */
async function fill(locator, value) {
  await locator.click();
  await locator.press('Control+A');
  await locator.press('Backspace');
  await locator.pressSequentially(value);
  await locator.blur();
}

module.exports = { test, expect: base.expect, fill };
