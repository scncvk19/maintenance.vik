"""Automatic Telegram reminder trigger for Docker deployments.

The worker never sees the bot token or database. It only calls the internal
backend endpoint when Telegram has been explicitly enabled in the environment.
"""
import os
import time
import urllib.error
import urllib.request

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000").rstrip("/")
ENABLED_VALUE = "YES_I_CONFIGURED_THE_BOT"


def interval_seconds() -> int:
    try:
        value = int(os.getenv("TELEGRAM_CHECK_INTERVAL_SECONDS", "3600"))
    except ValueError:
        value = 3600
    return max(300, value)


def run_once() -> None:
    if os.getenv("TELEGRAM_SEND_ENABLED") != ENABLED_VALUE:
        return
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
    delay = interval_seconds()
    print(f"Telegram reminder worker active; check interval {delay}s.", flush=True)
    while True:
        run_once()
        time.sleep(delay)


if __name__ == "__main__":
    main()
