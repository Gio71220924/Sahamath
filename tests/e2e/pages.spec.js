// Navigasi, bundle halaman, Panduan, kalender dividen, dan pesan error Analyzer.
const { test, expect } = require('./fixtures');

const ROUTES = {
  average: 'Hitung harga rata-rata portofoliomu.',
  araarb: 'Cek batas ARA dan ARB.',
  profit: 'Hitung profit bersih setelah fee.',
  amunisi: 'Berapa lot yang aman dibeli?',
  dividen: 'Hitung dividen yang masuk rekening.',
  analyzer: 'Ukur risiko per saham IDX.',
  heatmap: 'Heatmap sektor IDX.',
  profilrisiko: 'Profil risiko kamu.',
  papertrade: 'Latihan trading tanpa uang asli.',
  arena: 'Arena FO melawan bot.',
  guides: 'Panduan saham untuk pemula.',
};

test('semua halaman terbuka dari halaman depan', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cuan-mu, terukur. Tanpa drama.');
  for (const [route, title] of Object.entries(ROUTES)) {
    await page.evaluate((r) => { location.hash = r; }, route);
    await expect(page.locator('main h1'), route).toHaveText(title);
  }
});

test('link langsung ke halaman kalkulator', async ({ page }) => {
  await page.goto('/#profit');
  await expect(page.locator('main h1')).toHaveText(ROUTES.profit);
});

test('bundle halaman gagal dimuat: pesan + coba lagi', async ({ page }) => {
  let blocked = true;
  await page.route('**/pages.bundle.js', (route) => (blocked ? route.abort() : route.fallback()));
  await page.goto('/#guides');
  await expect(page.getByRole('alert')).toContainText('Halaman belum bisa dimuat');
  blocked = false;
  await page.getByRole('button', { name: 'coba lagi' }).click();
  await expect(page.locator('main h1')).toHaveText(ROUTES.guides);
});

test('panduan: kartu halaman depan membuka artikelnya sebagai dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Average down: kapan masuk akal\?/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Average down: kapan masuk akal?' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tutup panduan' }).first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.getByPlaceholder('Cari panduan...').fill('dividen');
  await expect(page.locator('main h3')).toHaveText(['Dividen atau capital gain?', 'Pajak saham di Indonesia']);
});

test('kalender dividen: status kandidat dan riwayat capture', async ({ page }) => {
  await page.goto('/#dividen');
  const cal = page.locator('section[aria-labelledby="div-cal"]');
  const row = (t) => cal.locator('tbody > tr', { has: page.locator('th', { hasText: t }) });
  await expect(row('AAAA')).toContainText('Kandidat');
  await expect(row('BBBB')).toContainText('Yield terlalu kecil');
  await expect(row('CCCC')).toContainText('Kurang likuid');

  await row('AAAA').getByRole('button', { name: 'Riwayat' }).click();
  const history = cal.getByText(/Kalau dulu dibeli di cum date/);
  await expect(history).toContainText('untung 1 dari 2 kali');
  await expect(cal).toContainText('+0,01%');
  await expect(cal).toContainText('−4,97%');

  await row('AAAA').getByRole('button', { name: 'Hitung' }).click();
  await expect(page.getByLabel('Harga Saham', { exact: true })).toHaveValue('1.000');
  await expect(page.getByLabel('Dividen per Lembar (DPS)', { exact: true })).toHaveValue('60');
});

test('analyzer: kode tidak dikenal menampilkan pesan yang jelas', async ({ page }) => {
  await page.goto('/#analyzer');
  await page.getByPlaceholder('Masukkan kode saham...').fill('XXXX');
  await page.locator('main').getByRole('button', { name: 'Analisa', exact: true }).click();
  await expect(page.locator('main')).toContainText('Kode XXXX tidak ditemukan di BEI');
});
