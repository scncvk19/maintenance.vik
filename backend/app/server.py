"""Production ASGI entry point; keeps existing core routes and adds optional features."""
from .main import app
from .telegram_reminders import router as telegram_router

app.include_router(telegram_router)
