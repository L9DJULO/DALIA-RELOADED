"""Atomic JSON writes with filenames independent of user input."""
import json
import os
import tempfile
from pathlib import Path
from hashlib import sha256

def cache_key(*parts) -> str:
    return sha256(json.dumps(parts, sort_keys=True, ensure_ascii=True).encode()).hexdigest()

def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, suffix=".tmp", delete=False) as f:
            name = f.name
            json.dump(data, f, ensure_ascii=False, allow_nan=False)
        os.replace(name, path)
    finally:
        if name and os.path.exists(name):
            os.unlink(name)
