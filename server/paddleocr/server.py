"""PaddleOCR fallback service.

Intended deployment: small always-on container (Cloud Run / Fly.io / Railway).
The Supabase Edge Function calls POST /ocr with the captured card crop only
after an opted-in, failed on-device scan.

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
MAX_IMAGE_BYTES = 4 * 1024 * 1024

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
    if not expected or authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Invalid token")

    if image.content_type not in {"image/jpeg", "image/png"}:
        raise HTTPException(status_code=415, detail="Expected a JPEG or PNG image")

    suffix = ".png" if image.content_type == "image/png" else ".jpg"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        path = handle.name
        size = 0
        while chunk := await image.read(64 * 1024):
            size += len(chunk)
            if size > MAX_IMAGE_BYTES:
                break
            handle.write(chunk)

    if size == 0 or size > MAX_IMAGE_BYTES:
        os.unlink(path)
        raise HTTPException(
            status_code=413 if size > MAX_IMAGE_BYTES else 400,
            detail="Image is too large" if size > MAX_IMAGE_BYTES else "Empty image",
        )

    try:
        return run_ocr(get_engine(), path)
    finally:
        os.unlink(path)
