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

- **Frontend**: React UMD, ReactDOM UMD, Babel Standalone, HTML, CSS, JavaScript.
- **UI styling**: CSS custom properties, responsive layout, dark/light theme support.
- **Backend**: Node.js HTTP server lewat `server.js`.
- **ML runtime**: Python untuk menjalankan `predict.py` dan `screener.py`.
- **Model ML**: `best_models.pkl` sebagai model utama, dengan fallback ke `trading_model.pkl`.
- **Data market**: TradingView, api-saham, Yahoo Finance, KSEI, IDX, BI, BPS, curated IPO calendar/RSS, serta Google News + Gemini (Analisis AI).
- **Portfolio optimizer**: `portfolio.py` (Modern Portfolio Theory) memakai numpy + scipy.

## Alur Sederhana Aplikasi

1. Pengguna membuka Sahamath di browser.
2. Frontend menampilkan halaman kalkulator, Analyzer, Screener, Market Calendar, atau Panduan Edukasi.
3. Untuk kalkulator sederhana seperti Average, Profit, Amunisi, dan Dividen, perhitungan dilakukan langsung di browser.
4. Untuk data saham seperti harga, papan pencatatan, calendar, Analyzer, dan Screener, frontend meminta data ke backend Node.js.
5. Backend mengambil data dari sumber eksternal seperti TradingView, KSEI, IDX, api-saham, atau Yahoo Finance.
6. Untuk Analyzer ML dan Screener, backend menjalankan script Python, membaca model `.pkl`, lalu mengembalikan hasil analisis ke frontend.
7. Frontend menampilkan hasil dalam bentuk trading plan, score, entry, target price, stop loss, broker flow, dan calendar event.

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

Untuk fitur Analyzer ML dan Screener, install dependency Python di virtual environment:

```bash
pip install pandas numpy scipy scikit-learn yfinance ta joblib requests
```

File model yang dibutuhkan:

```text
best_models.pkl
```

`trading_model.pkl` hanya fallback untuk format model lama.

## Model ML

Runtime Analyzer dan Screener membaca model dari:

```text
best_models.pkl
```

Model terbaru memakai pendekatan universal-first:

- satu model default untuk banyak saham;
- fitur RS IHSG, VSA, trend, volatility, liquidity;
- fallback ke model lama jika format lama masih tersedia.

Karena model `.pkl` adalah artefak binary, jangan push ke repo public jika model ingin tetap private.

## Deployment

Rekomendasi deployment:

```text
Netlify  -> frontend static
Render   -> backend Node + Python + model ML
```

Railway juga bisa dipakai sebagai backend pengganti Render. Konfigurasi Netlify di repo ini sudah mem-proxy API ke:

```text
https://sahamath-production.up.railway.app
```

Catatan penting:

- Netlify tidak menjalankan `server.js` sebagai backend permanen.
- Backend perlu host terpisah seperti Render.
- Render Free bisa dipakai untuk personal project, tetapi bisa sleep saat idle dan cold start bisa lambat.
- Jika repo public, jangan push `best_models.pkl`.
- Jika ingin satu repo dan model tetap private, ubah repository menjadi private.

Environment variable yang perlu diisi di Render untuk download model dari Supabase private bucket:

```text
SUPABASE_URL=isi_project_url
SUPABASE_SERVICE_ROLE_KEY=isi_secret_key
SUPABASE_BUCKET=models
SUPABASE_MODEL_PATH=best_models.pkl
```

Untuk fitur **Analisis AI** (Gemini), isi juga:

```text
GEMINI_API_KEY=isi_api_key_gemini
```

Di lokal, environment variable bisa ditaruh di file `.env` di root (otomatis dibaca `server.js` saat start; file ini sudah di-`.gitignore`). Di production, set variabel di dashboard host (Railway/Render â†’ Variables) karena `.env` tidak ikut ter-deploy. Variabel OS asli selalu menang atas `.env`. Tanpa `GEMINI_API_KEY`, endpoint Analisis AI mengembalikan 503 dan fitur lain tetap jalan.

### Update Kalender IPO

Production tidak scrape e-ipo langsung karena IP datacenter bisa diblok Cloudflare. Flow stabilnya:

```bash
npm run refresh:ipo
```

Jalankan command itu dari laptop/lokal untuk mengambil e-ipo, lalu hasilnya disimpan ke `data/ipo-calendar.json`. Backend `/ipo-news` akan membaca file curated itu. Jika file kosong, endpoint memakai RSS sebagai alert berita IPO yang belum diverifikasi. Live scrape di backend hanya aktif jika `IPO_ALLOW_LIVE_SCRAPE=1`.

Netlify build command:

```bash
npm run build:static
```

Netlify publish directory:

```text
dist
```

Render build command:

```bash
npm install && pip install -r requirements.txt && npm run download:model
```

Render start command:

```bash
npm start
```

Untuk Railway, deploy paling stabil memakai `Dockerfile` yang sudah tersedia di repository. Kosongkan custom build command/start command jika Railway mendeteksi Dockerfile, lalu isi environment variable Supabase yang sama.

## Dokumentasi Pengguna

Dokumentasi pengguna lengkap tersedia di:

```text
docs/sahamath-docs.md
```

Dokumen tersebut menjelaskan cara memakai kalkulator, Analyzer, Screener, Market Calendar, dan fitur edukasi dengan bahasa yang lebih ramah untuk pengguna akhir.

## Disclaimer

Sahamath bukan penasihat investasi. Data dari pihak ketiga dapat berubah, terlambat, atau gagal diakses. Selalu validasi ulang sebelum mengambil keputusan trading.
