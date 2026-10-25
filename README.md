<p align="center">
  <img src="favicon.svg" alt="Logo Sahamath" width="96" height="96" />
</p>

<h1 align="center">Sahamath</h1>

<p align="center">Kalkulator &amp; simulasi saham IDX untuk trader Indonesia.</p>

Sahamath adalah web kalkulator saham yang mudah dipakai untuk trader Indonesia. Mulai dari menghitung average price, batas ARA/ARB, profit/loss, position sizing, dividen, sampai membaca market calendar, screener swing, dan Analyzer.

> Bukan rekomendasi beli atau jual. Semua hasil kalkulator, screener, dan model ML dipakai sebagai alat bantu analisis. Tetap lakukan riset mandiri.

## Fitur

- **Average Price**: menghitung harga rata-rata dari beberapa transaksi beli.
- **ARA/ARB**: menghitung batas auto rejection berdasarkan harga saham dan papan pencatatan IDX.
- **Profit/Loss**: menghitung profit bersih setelah fee beli, fee jual, dan pajak.
- **Amunisi**: menghitung position sizing berdasarkan risiko per trade.
- **Dividen Yield**: menghitung yield dividen kotor dan bersih setelah PPh final.
- **Analyzer**: membaca harga, chart, fundamental, trading plan ATR, dan kisaran harga 5 hari.
- **Analisis AI**: ringkasan sentimen dan katalis per emiten dari berita Google News, dirangkai oleh Gemini (butuh `GEMINI_API_KEY`).
- **Screener IDX Energy**: mendeteksi kandidat swing dengan skor trend, VSA, entry, target price, dan stop loss. Termasuk strategi Triple Confirmation (RSI + MACD + MA20).
- **Profil Risiko**: kuis singkat menentukan profil risiko, lalu merekomendasikan alokasi portofolio berbasis Modern Portfolio Theory (Sharpe + Markowitz) lengkap dengan efficient frontier.
- **Kalender IPO**: jadwal IPO BEI dari data curated lokal, dengan RSS sebagai alert awal saat data curated kosong.
- **Market Calendar**: menampilkan corporate action saham dan event makro Indonesia.
- **Panduan Edukasi**: artikel ringkas untuk pemula seputar ARA/ARB, average down, risk management, dividen, bandarmology, pajak, dan cut loss.

## Tech Stack

Sahamath memakai frontend ringan berbasis React tanpa bundler production yang kompleks. UI dimuat dari `index.html`, styling utama ada di CSS, dan routing memakai hash route di browser.

- **Frontend**: React UMD, HTML, CSS, JavaScript. Lokal (`npm start`) memakai Babel Standalone di browser biar cepat diubah; production (Vercel) memakai bundle hasil esbuild: `app.bundle.js` (React production + halaman depan) dan `pages.bundle.js` (halaman lain, dimuat setelah halaman depan tampil).
- **UI styling**: CSS custom properties, responsive layout, dark/light theme support.
- **Backend**: Node.js HTTP server lewat `server.js`.
- **Python runtime**: `predict.py` (trading plan ATR + kisaran harga 5 hari) dan `screener.py` (swing setup). Tanpa model ML.
- **Data market**: TradingView, Yahoo Finance, KSEI, IDX, BI, BPS, curated IPO calendar/RSS, serta Google News + Gemini (Analisis AI).
- **Portfolio optimizer**: `portfolio.py` (Modern Portfolio Theory) memakai numpy + scipy.

## Alur Sederhana Aplikasi

1. Pengguna membuka Sahamath di browser.
2. Frontend menampilkan halaman kalkulator, Analyzer, Screener, Market Calendar, atau Panduan Edukasi.
3. Untuk kalkulator sederhana seperti Average, Profit, Amunisi, dan Dividen, perhitungan dilakukan langsung di browser.
4. Untuk data saham seperti harga, papan pencatatan, calendar, Analyzer, dan Screener, frontend meminta data ke backend Node.js.
5. Backend mengambil data dari sumber eksternal seperti TradingView, KSEI, IDX, atau Yahoo Finance.
6. Untuk Analyzer dan Screener, backend menjalankan script Python (indikator teknikal, ATR, volatilitas) lalu mengembalikan hasilnya ke frontend.
7. Frontend menampilkan hasil dalam bentuk trading plan, kisaran harga, score, entry, target price, stop loss, dan calendar event.

## Menjalankan di Lokal

Pastikan Node.js dan Python sudah terpasang.

```bash
npm install
npm start
```

Buka:

```text
http://localhost:3000
```

Untuk fitur Analyzer dan Screener, install dependency Python di virtual environment:

```bash
pip install -r requirements.txt
```

## Riset Model

App tidak memakai model ML. Trading plan dihitung dari ATR dan kisaran harga dari volatilitas 20 hari. Script riset `train*.py` (walk-forward, fit di proxy IDX100, diuji juga di saham lain) dipakai untuk menguji apakah model layak dipasang:

- `train.py`: stock picker LGBMRanker + HMM regime + faktor + fundamental. Tidak ada edge setelah fee.
- `train_range.py`: kisaran harga. Volatilitas 20 hari (lognormal) mengalahkan kuantil historis dan LightGBM quantile.
- `train_regime.py`: kisaran harga per regime HMM IHSG. Perbaikan hanya ~0.2%, tidak dipasang.
- `train_tp.py`, `train_tp_lgbm.py`: peluang kena TP sebelum SL. Model tidak lebih baik dari rata-rata historis, jadi yang ditampilkan di app cuma base rate.

Dependency training (tidak masuk `requirements.txt`): `pip install lightgbm hmmlearn scikit-learn`. Cache harga di `.cache/train/`.

## Deployment

```text
Vercel   -> frontend static (vercel.json)
Railway  -> backend Node + Python (Dockerfile)
```

`vercel.json` mem-proxy endpoint API ke:

```text
https://sahamath-production.up.railway.app
```

Catatan penting:

- Vercel tidak menjalankan `server.js` sebagai backend permanen, jadi backend tetap di Railway.

Untuk fitur **Analisis AI** (Gemini), isi environment variable:

```text
GEMINI_API_KEY=isi_api_key_gemini
```

Di lokal, environment variable bisa ditaruh di file `.env` di root (otomatis dibaca `server.js` saat start; file ini sudah di-`.gitignore`). Di production, set variabel di dashboard Railway (Variables) karena `.env` tidak ikut ter-deploy. Variabel OS asli selalu menang atas `.env`. Tanpa `GEMINI_API_KEY`, endpoint Analisis AI mengembalikan 503 dan fitur lain tetap jalan.

### Update Kalender IPO

Production tidak scrape e-ipo langsung karena IP datacenter bisa diblok Cloudflare. Flow stabilnya:

```bash
npm run refresh:ipo
```

Jalankan command itu dari laptop/lokal untuk mengambil e-ipo, lalu hasilnya disimpan ke `data/ipo-calendar.json`. Backend `/ipo-news` akan membaca file curated itu. Jika file kosong, endpoint memakai RSS sebagai alert berita IPO yang belum diverifikasi. Live scrape di backend hanya aktif jika `IPO_ALLOW_LIVE_SCRAPE=1`.

Build frontend (dipakai Vercel lewat `vercel.json`, output ke `dist`: JSX dikompilasi jadi `js/cuanmeter/app.bundle.js` dan `js/cuanmeter/pages.bundle.js`):

```bash
npm run build:static
```

Untuk Railway, deploy memakai `Dockerfile` yang sudah tersedia di repository. Kosongkan custom build command/start command jika Railway mendeteksi Dockerfile, lalu isi `GEMINI_API_KEY`.

## Dokumentasi Pengguna

Dokumentasi pengguna lengkap tersedia di:

```text
docs/sahamath-docs.md
```

Dokumen tersebut menjelaskan cara memakai kalkulator, Analyzer, Screener, Market Calendar, dan fitur edukasi dengan bahasa yang lebih ramah untuk pengguna akhir.

## Disclaimer

Sahamath bukan penasihat investasi. Data dari pihak ketiga dapat berubah, terlambat, atau gagal diakses. Selalu validasi ulang sebelum mengambil keputusan trading.
