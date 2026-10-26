// Kalkulator: angka acuan sama dengan UAT (UAT-12 s/d 20) + kasus tepi yang pernah jadi temuan.
const { test, expect, fill } = require('./fixtures');

const field = (page, label) => page.getByLabel(label, { exact: true });

test('rata-rata: data bawaan dan dua transaksi sendiri', async ({ page }) => {
  await page.goto('/#average');
  const main = page.locator('main');
  await expect(main).toContainText('Rp 11.258,33');
  await expect(main).toContainText('Rp 13.510.000');

  await page.getByRole('button', { name: 'Hapus transaksi 3' }).click();
  const inputs = main.locator('input');
  await expect(inputs).toHaveCount(4);
  await fill(inputs.nth(0), '10');
  await fill(inputs.nth(1), '4500');
  await fill(inputs.nth(2), '10');
  await fill(inputs.nth(3), '4200');
  await expect(main).toContainText('Rp 4.350');
  await expect(main).toContainText('Rp 8.700.000');
});

test('ARA/ARB: tier dan pembulatan fraksi harga', async ({ page }) => {
  await page.goto('/#araarb');
  const main = page.locator('main');
  await expect(main).toContainText('ARA (batas atas)');
  await expect(main).toContainText('Rp 13.825'); // bawaan 11.525, tier 3
  await expect(main).toContainText('Rp 9.800');
  // harga → [ARA, ARB]; fraksi: <200 Rp1, <500 Rp2, <2.000 Rp5, <5.000 Rp10, ≥5.000 Rp25
  const cases = { 1000: ['Rp 1.250', 'Rp 850'], 200: ['Rp 270', 'Rp 170'], 201: ['Rp 250', 'Rp 171'], 5000: ['Rp 6.250', 'Rp 4.250'], 5025: ['Rp 6.025', 'Rp 4.280'] };
  for (const [price, [ara, arb]] of Object.entries(cases)) {
    await fill(field(page, 'Harga Saham (Rp)'), price);
    await expect(main.getByText(ara, { exact: true }), `ARA harga ${price}`).toBeVisible();
    await expect(main.getByText(arb, { exact: true }), `ARB harga ${price}`).toBeVisible();
  }
  await fill(field(page, 'Harga Saham (Rp)'), '49');
  await expect(main.getByRole('alert')).toContainText('Harga minimum saham di bursa Rp 50');
});

test('profit: fee standar, fee desimal, dan fee tersimpan ke nota depan', async ({ page }) => {
  await page.goto('/#profit');
  const main = page.locator('main');
  await page.getByRole('button', { name: /Pakai standar/ }).click();
  await expect(main).toContainText('Rp 289.250');
  await expect(main).toContainText('Rp 10.750');
  await expect(main).toContainText('Rp 2.510,03');
  await expect(main).toContainText('ROI: +11,57%');

  // ketik "0,1": koma desimal tidak boleh hilang saat mengetik
  await fill(field(page, 'Fee Beli'), '0,1');
  await fill(field(page, 'Fee Jual'), '0,15');
  await expect(field(page, 'Fee Beli')).toHaveValue('0,1');
  await expect(field(page, 'Fee Jual')).toHaveValue('0,15');
  await expect(main).toContainText('Rp 6.700');

  await page.reload();
  await expect(field(page, 'Fee Beli')).toHaveValue('0,1');
  await page.goto('/#home');
  await expect(page.getByText('Fee broker 0,1% beli dan 0,15% jual.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Nota profit' })).toContainText('Fee beli 0,1%');
});

test('amunisi: lot maksimal dan stop loss di atas entry', async ({ page }) => {
  await page.goto('/#amunisi');
  const main = page.locator('main');
  await expect(main).toContainText('66 lot');
  await expect(main).toContainText('Rp 1.000.000');
  await expect(main).toContainText('33,0%');
  await fill(field(page, 'Stop Loss'), '2600');
  await expect(main.getByRole('alert')).toContainText('Stop loss harus di bawah harga entry');
  await expect(main).toContainText('0 lot');
});

test('dividen: yield bersih dari data bawaan', async ({ page }) => {
  await page.goto('/#dividen');
  const main = page.locator('main');
  await expect(main).toContainText('1,72%');
  await expect(main).toContainText('Rp 396.000');
});
