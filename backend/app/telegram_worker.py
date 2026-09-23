"""Automatic Telegram reminder trigger for Docker deployments.

The worker never receives the bot token. It reads only enabled/interval state
from the backend and lets the backend perform the actual send.
"""
import json
import os
import time
import urllib.error
import urllib.request

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000").rstrip("/")


def worker_config() -> tuple[bool, int]:
    request = urllib.request.Request(f"{BACKEND_URL}/notifications/telegram/worker-config", method="GET")
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.loads(response.read(4096))
        enabled = bool(data.get("enabled", False))
        interval = max(300, min(86400, int(data.get("interval_seconds", 3600))))
        return enabled, interval
    except Exception:
        print("Telegram worker could not read backend configuration.", flush=True)
        return False, 60


def run_once() -> None:
    request = urllib.request.Request(
        f"{BACKEND_URL}/notifications/telegram/send",
        headers={"X-Confirm-Send": "SEND_TELEGRAM"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            response.read(4096)
    except urllib.error.HTTPError as exc:
        # Keep logs generic: never print tokens, chat IDs or response bodies.
        print(f"Telegram reminder check returned HTTP {exc.code}.", flush=True)
    except Exception:
        print("Telegram reminder check could not reach the backend.", flush=True)


def main() -> None:
    print("Telegram reminder worker active; configuration is managed by the backend.", flush=True)
    while True:
        enabled, interval = worker_config()
        if enabled:
            run_once()
            time.sleep(interval)
        else:
            # Re-check soon so enabling Telegram in the UI works without a container restart.
            time.sleep(60)


if __name__ == "__main__":
    main()
