"""PaddleOCR fallback service.

Intended deployment: small always-on container (Cloud Run / Fly.io / Railway).
The app calls POST /ocr with the captured card crop ONLY when the on-device
ML Kit pass fails to produce a match, so traffic stays low.

Run locally:
    uvicorn server:app --host 0.0.0.0 --port 8787

Auth: set OCR_SERVICE_TOKEN and send it as `Authorization: Bearer <token>`.
"""

from __future__ import annotations

import os
import tempfile

try:
    import paddleocr  # noqa: F401 -- fail fast with a useful message
except ModuleNotFoundError as error:
    raise SystemExit(
        "paddleocr is not importable — you are probably running uvicorn from "
        "the wrong Python environment. Launch with the project venv instead:\n"
        "  .\\.venv\\Scripts\\uvicorn.exe server:app --host 0.0.0.0 --port 8787\n"
        "or run .\\serve.ps1",
    ) from error

from fastapi import FastAPI, File, Header, HTTPException, UploadFile

from ocr_card import build_engine, run_ocr

app = FastAPI(title="Show-Off PaddleOCR fallback")

# One engine per process; model load takes seconds, inference takes ~100s of ms.
_engine = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = build_engine()
    return _engine


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/ocr")
async def ocr(
    image: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):
    expected = os.environ.get("OCR_SERVICE_TOKEN")
    if expected and authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Invalid token")

    suffix = os.path.splitext(image.filename or "card.jpg")[1] or ".jpg"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        handle.write(await image.read())
        path = handle.name

    try:
        return run_ocr(get_engine(), path)
    finally:
        os.unlink(path)
