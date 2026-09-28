"""
app/utils/helpers.py
Miscellaneous helper utilities.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from typing import Any


def file_md5(path: Path) -> str:
    """Return MD5 hex digest of a file."""
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def dataset_version_id(paths: list[Path]) -> str:
    """
    Create a short version identifier from the concatenated MD5 of all dataset
    files.  This changes whenever any file changes, triggering model retraining.
    """
    combined = "".join(file_md5(p) for p in paths if p.exists())
    return hashlib.md5(combined.encode()).hexdigest()[:12]


def load_json(path: Path) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: Any, indent: int = 2) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=indent, default=str)


def round2(x: float) -> float:
    return round(float(x), 2)


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))
