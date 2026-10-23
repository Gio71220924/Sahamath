"""Kolektor data harian untuk riset (jalan di GitHub Actions, commit ke branch `data`).

- news/YYYY-MM-DD.jsonl.gz : judul Google News 2 hari terakhir untuk top-100 saham (nilai transaksi
  hari itu, dari TradingView). Disimpan mentah; sentimen dinilai belakangan setelah histori cukup.
- ksei/BalanceposEfekYYYYMMDD.zip : komposisi kepemilikan bulanan KSEI (lokal/asing per tipe
  investor). Disalin karena halaman arsip KSEI cuma menampilkan bulan-bulan terakhir.

Run: python scripts/collect_daily.py <out_dir>
"""
import datetime as dt
import email.utils
import gzip
import html
import json
import os
import re
import sys
import time

import requests

UA = {"User-Agent": "Mozilla/5.0"}
TOP_N = 100
KSEI = "https://web.ksei.co.id"


def top_tickers(n=TOP_N):
    r = requests.post("https://scanner.tradingview.com/indonesia/scan", timeout=30, json={
        "filter": [{"left": "type", "operation": "equal", "right": "stock"}],
        "columns": ["name"],
        "sort": {"sortBy": "Value.Traded", "sortOrder": "desc"},
        "range": [0, n]})
    r.raise_for_status()
    return [row["d"][0] for row in r.json()["data"] if re.fullmatch(r"[A-Z]{4}", row["d"][0])]


def tag(raw, name):
    m = re.search(rf"<{name}[^>]*>(.*?)</{name}>", raw, re.S)
    text = m.group(1) if m else ""
    return html.unescape(re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", text, flags=re.S)).strip()


def news(code, collected):
    q = requests.utils.quote(f'"{code}" saham when:2d')
    url = f"https://news.google.com/rss/search?q={q}&hl=id-ID&gl=ID&ceid=ID:id"
    xml = requests.get(url, headers=UA, timeout=20).text
    rows = []
    for raw in xml.split("<item>")[1:]:
        pub = tag(raw, "pubDate")
        rows.append({
            "collected": collected,
            "ticker": code,
            "title": tag(raw, "title"),
            "source": tag(raw, "source"),
            "published": email.utils.parsedate_to_datetime(pub).isoformat() if pub else None,
        })  # ponytail: link redirect Google ~250 char/baris dibuang, judul+sumber+waktu cukup buat sentimen
    return rows


def ksei_archive(out_dir):
    page = requests.get(f"{KSEI}/archive_download/holding_composition", headers=UA, timeout=30).text
    saved = []
    for path in sorted(set(re.findall(r'/Download/BalanceposEfek\d{8}\.zip', page))):
        target = os.path.join(out_dir, os.path.basename(path))
        if os.path.exists(target):
            continue
        r = requests.get(KSEI + path, headers=UA, timeout=60)
        if r.ok and r.content[:2] == b"PK":
            with open(target, "wb") as f:
                f.write(r.content)
            saved.append(os.path.basename(path))
    return saved


def main():
    out = sys.argv[1]
    today = dt.date.today().isoformat()
    os.makedirs(os.path.join(out, "news"), exist_ok=True)
    os.makedirs(os.path.join(out, "ksei"), exist_ok=True)

    rows, failed = [], []
    for code in top_tickers():
        try:
            rows += news(code, today)
        except Exception as e:  # satu ticker gagal jangan bikin seluruh hari hilang
            failed.append(f"{code}: {e}")
        time.sleep(0.5)
    with gzip.open(os.path.join(out, "news", f"{today}.jsonl.gz"), "wt", encoding="utf-8") as f:
        f.writelines(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
    print(f"news: {len(rows)} judul, {len(failed)} ticker gagal {failed[:3]}")

    print("ksei baru:", ksei_archive(os.path.join(out, "ksei")) or "-")
    if not rows:
        sys.exit("news kosong: Google News kemungkinan memblokir runner")


if __name__ == "__main__":
    main()
