from __future__ import annotations

import json
import sys
from pathlib import Path

from pypdf import PdfReader


def normalize_text(text: str) -> str:
    lines = [line.rstrip() for line in text.replace("\r", "").split("\n")]
    paragraphs: list[str] = []
    current: list[str] = []

    def flush_current() -> None:
        nonlocal current
        if current:
            paragraphs.append(" ".join(part.strip() for part in current if part.strip()))
            current = []

    for raw_line in lines:
        line = raw_line.strip()

        if not line:
            flush_current()
            continue

        is_bullet = line.startswith(("-", "*", "\u2022"))

        if is_bullet:
            flush_current()
            paragraphs.append(line)
            continue

        current.append(line)

    flush_current()

    return "\n\n".join(paragraph for paragraph in paragraphs if paragraph).strip()


def extract_text(pdf_path: Path) -> str:
    reader = PdfReader(str(pdf_path))
    chunks: list[str] = []

    for page in reader.pages:
        text = page.extract_text() or ""
        if text.strip():
            chunks.append(normalize_text(text))

    return "\n\n".join(chunks).strip()


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Missing PDF path"}))
        return 1

    pdf_path = Path(sys.argv[1])

    if not pdf_path.exists():
        print(json.dumps({"ok": False, "error": "PDF file not found"}))
        return 1

    try:
        text = extract_text(pdf_path)
        print(json.dumps({"ok": True, "text": text}))
        return 0
    except Exception as exc:  # pragma: no cover
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
