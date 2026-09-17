# PaddleOCR fallback experiment

Evaluates [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) (PP-OCR) as a
**server-side second pass** for Pokémon card scans that the on-device ML Kit
pipeline fails to match.

## Why server-side, not on-device

PaddleOCR is Python on the PaddlePaddle runtime — it cannot run inside a React
Native app as-is. On-device deployment technically exists (Paddle Lite compiles
PP-OCR det/rec models for ARM), but there are **no React Native bindings**: it
would mean writing and maintaining a custom native module around the C++
runtime for both platforms, plus model conversion. ML Kit already covers the
fast path on-device, so the pragmatic architecture is:

1. **Attempt 1 (on-device, offline, ~1s):** ML Kit — current pipeline, free.
2. **Attempt 2 (server, only on failure):** upload the cropped card image to
   this service, re-run `parsePokemonCardText` on its output, search again.

Traffic is naturally low (failed scans only), so this fits a small always-on
container (Cloud Run / Fly.io / Railway) — 1 vCPU handles PP-OCR mobile models
in a few hundred ms per image. Note: Supabase Edge Functions are Deno and
cannot host this; it needs its own Python container.

## Files

| File | Purpose |
|---|---|
| `ocr_card.py` | CLI test: `python ocr_card.py image.jpg --pretty` |
| `server.py` | FastAPI service exposing authenticated `POST /ocr` |
| `requirements.txt` | paddlepaddle + paddleocr + fastapi |

## Setup

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt   # Windows
python ocr_card.py ../../assets/test_images/card.png --pretty
```

First run downloads the PP-OCR detection/recognition models (~30 MB).

## Output shape

Matches the app's `PokemonOcrResult` (`{ text, blocks: [{ lines: [{ text }] }] }`),
so results can be pasted directly into `recognition.test.ts` fixtures or fed to
`parsePokemonCardText` unchanged. `lineConfidences` and `durationMs` are extra
diagnostics.

## Running the service

Always use the venv's uvicorn — a bare `uvicorn` from conda/base Python will
crash with `ModuleNotFoundError: paddleocr`:

```powershell
.\serve.ps1
# or explicitly:
.\.venv\Scripts\uvicorn.exe server:app --host 0.0.0.0 --port 8787
```

Set `OCR_SERVICE_TOKEN` on Railway. Set the same value as a Supabase Edge
Function secret alongside `OCR_SERVICE_URL=https://your-railway-host` (the
base URL, without `/ocr`). Deploy `ocr-fallback` with JWT verification enabled.
The mobile app invokes that function using its signed-in session; no service
token or Railway URL is embedded in the app or Cloudflare Pages. Curators opt
in from the scanner, and only a failed on-device match sends the card crop.
The service removes its temporary image after each request. The function
enforces Curator membership and a 4 MB upload limit; the service also requires
the token and bounds uploads to 4 MB.

```bash
curl -H "Authorization: Bearer $OCR_SERVICE_TOKEN" -F "image=@card.jpg" http://localhost:8787/ocr
```
