"""CLI test: run PaddleOCR (PP-OCR) on a card image.

Emits JSON in the same shape as the app's `PokemonOcrResult`
({ text, blocks: [{ lines: [{ text }] }] }) so the output can be fed
straight into `parsePokemonCardText` fixtures for comparison against
ML Kit results.

Usage:
    python ocr_card.py card.jpg [card2.jpg ...] [--pretty] [--crop] [--out-dir output]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

# Mirrored from api/pokemon/recognition.ts
CARD_ASPECT_RATIO = 63 / 88
OCR_IMAGE_WIDTH = 1400


def center_card_crop(image_path: str) -> str:
    """Apply the app's centered card crop + resize (calculatePokemonCardCrop
    followed by the OCR_IMAGE_WIDTH downscale), so the server sees exactly
    what the on-device pipeline would upload."""
    from PIL import Image

    image = Image.open(image_path)
    width, height = image.size
    crop_width = min(width * 0.9, height * CARD_ASPECT_RATIO)
    crop_height = crop_width / CARD_ASPECT_RATIO
    left = max(0, (width - crop_width) / 2)
    top = max(0, (height - crop_height) / 2)
    cropped = image.crop((int(left), int(top), int(left + crop_width), int(top + crop_height)))

    if cropped.width > OCR_IMAGE_WIDTH:
        target_height = round(cropped.height * OCR_IMAGE_WIDTH / cropped.width)
        cropped = cropped.resize((OCR_IMAGE_WIDTH, target_height))

    cropped_path = f"{image_path}.cropped.jpg"
    cropped.convert("RGB").save(cropped_path, quality=90)
    return cropped_path


def build_engine():
    import os

    from paddleocr import PaddleOCR

    # Doc-orientation/unwarp stages target scanned documents; cards are
    # already framed, so skip them for speed. Textline orientation stays on
    # because card footers mix tiny rotated text.
    #
    # MKL-DNN is off by default: paddle 3.x's oneDNN+PIR path crashes on
    # Windows ("ConvertPirAttribute2RuntimeAttribute not support"). Set
    # OCR_ENABLE_MKLDNN=1 on Linux deployments for the speedup.
    return PaddleOCR(
        lang="en",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=True,
        enable_mkldnn=os.environ.get("OCR_ENABLE_MKLDNN") == "1",
    )


def run_ocr(engine, image_path: str) -> dict:
    started = time.time()

    lines: list[dict] = []
    try:
        # paddleocr >= 3.0 pipeline API
        results = engine.predict(image_path)
        for page in results:
            texts = page.get("rec_texts", []) or []
            scores = page.get("rec_scores", []) or []
            for index, text in enumerate(texts):
                score = scores[index] if index < len(scores) else None
                lines.append({"text": text, "confidence": score})
    except AttributeError:
        # paddleocr 2.x fallback
        results = engine.ocr(image_path, cls=True)
        for page in results or []:
            for entry in page or []:
                text, score = entry[1]
                lines.append({"text": text, "confidence": float(score)})

    duration_ms = round((time.time() - started) * 1000)
    return {
        # Shape-compatible with the app's PokemonOcrResult
        "text": "\n".join(line["text"] for line in lines),
        "blocks": [{"lines": [{"text": line["text"]} for line in lines]}],
        # Extra diagnostics for the experiment
        "lineConfidences": lines,
        "durationMs": duration_ms,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("images", nargs="+", help="Paths to card images")
    parser.add_argument("--pretty", action="store_true", help="Indent JSON output")
    parser.add_argument(
        "--crop",
        action="store_true",
        help="Apply the app's centered card crop before OCR",
    )
    parser.add_argument("--out-dir", help="Write <image>.json files instead of stdout")
    args = parser.parse_args()

    engine = build_engine()
    if args.out_dir:
        os.makedirs(args.out_dir, exist_ok=True)

    for image_path in args.images:
        ocr_path = center_card_crop(image_path) if args.crop else image_path
        try:
            result = run_ocr(engine, ocr_path)
        finally:
            if ocr_path != image_path:
                os.unlink(ocr_path)
        result["image"] = os.path.basename(image_path)

        if args.out_dir:
            stem = os.path.splitext(os.path.basename(image_path))[0]
            out_path = os.path.join(args.out_dir, f"{stem}.json")
            with open(out_path, "w", encoding="utf-8") as handle:
                json.dump(result, handle, ensure_ascii=False, indent=2)
            print(f"{image_path} -> {out_path} ({result['durationMs']}ms)")
        else:
            json.dump(
                result, sys.stdout, ensure_ascii=False, indent=2 if args.pretty else None
            )
            print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
