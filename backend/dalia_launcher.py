"""
DALIA Launcher — Entry point for the packaged executable.

Starts the FastAPI server and opens the browser automatically.
"""
from __future__ import annotations

import logging
import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn


def _setup_logging():
    """Configure logging for the packaged app."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s │ %(name)-20s │ %(levelname)-7s │ %(message)s",
        datefmt="%H:%M:%S",
    )


def _find_free_port(start: int = 8000, end: int = 8100) -> int:
    """Find a free TCP port in the given range."""
    for port in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return start


def _open_browser(port: int, delay: float = 2.5):
    """Open the default browser after a short delay."""
    time.sleep(delay)
    url = f"http://localhost:{port}"
    print(f"\n  ✦  DALIA is running at: {url}")
    print(f"  ✦  Opening your browser...\n")
    webbrowser.open(url)


def main():
    _setup_logging()
    logger = logging.getLogger("dalia.launcher")

    # Banner
    print("=" * 58)
    print("  DALIA — Draft Analysis League Intelligence Assistant")
    print("=" * 58)
    print()

    port = _find_free_port()
    logger.info(f"Starting DALIA on port {port}")

    # Open browser in a background thread
    threading.Thread(target=_open_browser, args=(port,), daemon=True).start()

    # Import app directly (avoids uvicorn string-import issues with PyInstaller)
    from app.main import app

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
