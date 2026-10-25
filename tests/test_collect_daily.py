"""Cek scripts/collect_daily.py tanpa jaringan. Run: python tests/test_collect_daily.py"""
import gzip
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import collect_daily as cd  # noqa: E402

RSS = '<?xml version="1.0"?><rss><channel><item><title>BBCA naik</title><source>X</source>' \
      '<pubDate>Sun, 25 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>'


class Resp:
    def __init__(self, status, text):
        self.status_code, self.text = status, text


calls = []


def fake_get(status, text):
    def get(url, **kw):
        calls.append(url)
        return Resp(status, text)
    return get


cd.top_tickers = lambda n=100: [f"T{i:03d}" for i in range(100)]
cd.ksei_archive = lambda out: []
cd.time.sleep = lambda s: None


def run(out, final=None):
    os.environ.pop("FINAL_ATTEMPT", None)
    if final:
        os.environ["FINAL_ATTEMPT"] = final
    sys.argv = ["collect_daily.py", out]
    cd.main()


def news_file(out):
    return os.path.join(out, "news", f"{cd.dt.date.today().isoformat()}.jsonl.gz")


# diblokir (HTTP 200 tapi bukan RSS): berhenti setelah 5 ticker, tidak tulis file kosong, cuma warning
with tempfile.TemporaryDirectory() as out:
    calls.clear()
    cd.requests.get = fake_get(200, "<html>unusual traffic</html>")
    run(out)
    assert len(calls) == 5, len(calls)
    assert not os.path.exists(news_file(out))
    # run cadangan/manual yang masih diblokir harus gagal
    try:
        run(out, final="true")
        raise AssertionError("harus SystemExit")
    except SystemExit:
        pass

# normal: semua ticker diambil, file ditulis; run berikutnya hari yang sama melewati news
with tempfile.TemporaryDirectory() as out:
    calls.clear()
    cd.requests.get = fake_get(200, RSS)
    run(out, final="true")
    assert len(calls) == 100, len(calls)
    with gzip.open(news_file(out), "rt", encoding="utf-8") as f:
        assert sum(1 for _ in f) == 100
    calls.clear()
    run(out, final="true")
    assert calls == [], calls

print("ok")
