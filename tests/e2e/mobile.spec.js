// Tampilan HP (390px): tidak ada geser ke samping, menu garis tiga, pill IHSG disembunyikan.
const { test, expect } = require('./fixtures');

const ROUTES = ['home', 'average', 'araarb', 'profit', 'amunisi', 'dividen', 'analyzer', 'heatmap', 'profilrisiko', 'papertrade', 'arena', 'guides'];

test('semua halaman muat di lebar 390px', async ({ page }) => {
  await page.goto('/');
  for (const route of ROUTES) {
    await page.evaluate((r) => { location.hash = r; }, route);
    await expect(page.locator('h1').first()).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, `lebar halaman #${route}`).toBeLessThanOrEqual(390);
  }
});

test('menu garis tiga dan pill IHSG', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.ihsg-floater')).toBeHidden();
  await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Profit', exact: true }).first().click();
  await expect(page.locator('main h1')).toHaveText('Hitung profit bersih setelah fee.');
});
