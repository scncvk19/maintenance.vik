"""Production ASGI entry point; keeps existing core routes and adds optional features."""
from .main import app
from .telegram_reminders import router as telegram_router
from .document_analysis import router as document_analysis_router
from .document_category import router as document_category_router

app.include_router(telegram_router)
app.include_router(document_analysis_router)
app.include_router(document_category_router)
