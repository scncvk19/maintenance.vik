"""Narrow, explicit human-confirmed category change; never alters file bytes."""
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .database import Session, data_lock
from .models import Document

router = APIRouter(prefix="/documents", tags=["documents"])
Category = Literal["energy", "tax", "insurance", "maintenance", "repair", "invoice", "rent", "other"]


class CategoryConfirmation(BaseModel):
    category: Category
    expected_category: Category
    expected_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


@router.post("/{document_id}/confirm-category")
def confirm_document_category(document_id: str, payload: CategoryConfirmation):
    with data_lock, Session() as session:
        document = session.get(Document, document_id)
        if document is None:
            raise HTTPException(404, "Dokument nicht gefunden.")
        if document.category != payload.expected_category or document.sha256 != payload.expected_sha256:
            raise HTTPException(409, "Dokument wurde inzwischen verändert. Bitte erneut laden.")
        document.category = payload.category
        document.analysis_status = "manual"
        session.add(document)
        session.commit()
        return {"id": document.id, "category": document.category, "analysis_status": document.analysis_status}
