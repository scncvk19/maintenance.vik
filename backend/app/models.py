from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Asset(Base):
    __tablename__ = "assets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(30))
    location: Mapped[str] = mapped_column(String(300), default="")
    condition: Mapped[str] = mapped_column(String(30), default="good")
    notes: Mapped[str] = mapped_column(Text, default="")
    contact_first_name: Mapped[str] = mapped_column(String(120), default="")
    contact_last_name: Mapped[str] = mapped_column(String(120), default="")
    contact_birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    tax_id: Mapped[str] = mapped_column(String(64), default="")
    tax_notes: Mapped[str] = mapped_column(Text, default="")
    property_id: Mapped[str | None] = mapped_column(ForeignKey("assets.id"), nullable=True)
    cover_document_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


class Component(Base):
    __tablename__ = "components"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    name: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(30), default="component")
    notes: Mapped[str] = mapped_column(Text, default="")


class WorkItem(Base):
    __tablename__ = "work_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    component_id: Mapped[str | None] = mapped_column(ForeignKey("components.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(30), default="open")
    priority: Mapped[str] = mapped_column(String(30), default="normal")
    due_date: Mapped[date] = mapped_column(Date)
    completed_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    interval_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")


class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    title: Mapped[str] = mapped_column(String(160))
    direction: Mapped[str] = mapped_column(String(20))
    amount_cents: Mapped[int] = mapped_column(Integer)
    booked_date: Mapped[date] = mapped_column(Date)
    category: Mapped[str] = mapped_column(String(40), default="other")
    notes: Mapped[str] = mapped_column(Text, default="")


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    title: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(40), default="other")
    document_date: Mapped[date] = mapped_column(Date)
    notes: Mapped[str] = mapped_column(Text, default="")
    filename: Mapped[str] = mapped_column(String(255))
    storage_key: Mapped[str] = mapped_column(String(64))
    size: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    analysis_status: Mapped[str] = mapped_column(String(30), default="manual")
    reminder_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reminder_days: Mapped[int] = mapped_column(Integer, default=30)


class Contract(Base):
    __tablename__ = "contracts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(160))
    provider: Mapped[str] = mapped_column(String(160), default="")
    market_location_id: Mapped[str] = mapped_column(String(120), default="")
    billing_cycle: Mapped[str] = mapped_column(String(20), default="monthly")
    amount_cents: Mapped[int] = mapped_column(Integer)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    reminder_days: Mapped[int] = mapped_column(Integer, default=30)
    notes: Mapped[str] = mapped_column(Text, default="")
    analysis_status: Mapped[str] = mapped_column(String(30), default="manual")


class NotificationRecipient(Base):
    __tablename__ = "notification_recipients"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    channel: Mapped[str] = mapped_column(String(20))
    label: Mapped[str] = mapped_column(String(120))
    address: Mapped[str] = mapped_column(String(180))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_contracts: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_documents: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_work_items: Mapped[bool] = mapped_column(Boolean, default=True)


class Person(Base):
    __tablename__ = "people"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    first_name: Mapped[str] = mapped_column(String(120))
    last_name: Mapped[str] = mapped_column(String(120))
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    tax_id: Mapped[str] = mapped_column(String(64), default="")
    notes: Mapped[str] = mapped_column(Text, default="")


class Residence(Base):
    __tablename__ = "residences"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    person_id: Mapped[str] = mapped_column(ForeignKey("people.id"))
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")


class TrashItem(Base):
    __tablename__ = "trash_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    resource: Mapped[str] = mapped_column(String(60))
    record_id: Mapped[str] = mapped_column(String(36))
    label: Mapped[str] = mapped_column(String(255), default="")
    payload: Mapped[str] = mapped_column(Text)
    deleted_at: Mapped[str] = mapped_column(String(40))


class ActivityLog(Base):
    __tablename__ = "activity_log"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    action: Mapped[str] = mapped_column(String(30))
    resource: Mapped[str] = mapped_column(String(60))
    record_id: Mapped[str] = mapped_column(String(36), default="")
    label: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[str] = mapped_column(String(40))


class TaxVault(Base):
    __tablename__ = "tax_vault"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    salt: Mapped[str] = mapped_column(String(64))
    verifier: Mapped[str] = mapped_column(String(128))
    password_wrapped_key: Mapped[str] = mapped_column(Text, default="")
    recovery_salt: Mapped[str] = mapped_column(String(64), default="")
    recovery_verifier: Mapped[str] = mapped_column(String(128), default="")
    recovery_wrapped_key: Mapped[str] = mapped_column(Text, default="")


class TaxCase(Base):
    __tablename__ = "tax_cases"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    encrypted_payload: Mapped[str] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(String(30), default="")
    updated_at: Mapped[str] = mapped_column(String(30), default="")


class TaxAttachment(Base):
    __tablename__ = "tax_attachments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tax_case_id: Mapped[str] = mapped_column(ForeignKey("tax_cases.id"))
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    encrypted_blob: Mapped[str] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(String(30), default="")


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class AssetInput(Input):
    name: str = Field(min_length=1, max_length=160)
    kind: Literal["building", "vehicle", "equipment", "property"]
    location: str = Field(default="", max_length=300)
    condition: Literal["good", "attention", "critical"] = "good"
    notes: str = Field(default="", max_length=10000)
    contact_first_name: str = Field(default="", max_length=120)
    contact_last_name: str = Field(default="", max_length=120)
    contact_birth_date: date | None = None
    property_id: str | None = None

    @field_validator("contact_birth_date", mode="before")
    @classmethod
    def blank_birth_date_is_empty(cls, value):
        return None if value == "" else value


class ComponentInput(Input):
    asset_id: str
    name: str = Field(min_length=1, max_length=160)
    kind: Literal["room", "area", "component"] = "component"
    notes: str = Field(default="", max_length=10000)


class WorkInput(Input):
    asset_id: str
    component_id: str | None = None
    title: str = Field(min_length=1, max_length=160)
    kind: Literal["maintenance", "task", "defect", "appointment", "tax_return"]
    status: Literal["open", "in_progress", "done"] = "open"
    priority: Literal["low", "normal", "high", "critical", "urgent"] = "normal"
    due_date: date
    interval_days: int | None = Field(default=None, ge=1, le=3650)
    notes: str = Field(default="", max_length=10000)


Category = Literal["energy", "tax", "insurance", "maintenance", "repair", "invoice", "rent", "other"]


class TransactionInput(Input):
    asset_id: str
    title: str = Field(min_length=1, max_length=160)
    direction: Literal["income", "expense"]
    amount_cents: int = Field(gt=0, le=2_000_000_000, strict=True)
    booked_date: date
    category: Category = "other"
    notes: str = Field(default="", max_length=10000)


class DocumentInput(Input):
    asset_id: str
    title: str = Field(min_length=1, max_length=160)
    category: Category = "other"
    document_date: date
    notes: str = Field(default="", max_length=10000)
    reminder_date: date | None = None
    reminder_days: int = Field(default=30, ge=0, le=365)


class ContractInput(Input):
    asset_id: str
    document_id: str | None = None
    title: str = Field(min_length=1, max_length=160)
    provider: str = Field(default="", max_length=160)
    market_location_id: str = Field(default="", max_length=120)
    billing_cycle: Literal["monthly", "yearly"] = "monthly"
    amount_cents: int = Field(gt=0, le=2_000_000_000, strict=True)
    start_date: date
    end_date: date
    reminder_days: int = Field(default=30, ge=0, le=365)
    notes: str = Field(default="", max_length=10000)


class NotificationRecipientInput(Input):
    channel: Literal["telegram"]
    label: str = Field(min_length=1, max_length=120)
    address: str = Field(min_length=1, max_length=180)
    active: bool = True
    notify_contracts: bool = True
    notify_documents: bool = True
    notify_work_items: bool = True


class PersonInput(Input):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    birth_date: date | None = None
    tax_id: str = Field(default="", max_length=64)
    notes: str = Field(default="", max_length=10000)


class ResidenceInput(Input):
    person_id: str
    asset_id: str
    start_date: date
    end_date: date | None = None
    notes: str = Field(default="", max_length=10000)


RESOURCES = {
    "assets": (Asset, AssetInput),
    "components": (Component, ComponentInput),
    "work-items": (WorkItem, WorkInput),
    "transactions": (Transaction, TransactionInput),
    "documents": (Document, DocumentInput),
    "contracts": (Contract, ContractInput),
    "notification-recipients": (NotificationRecipient, NotificationRecipientInput),
    "people": (Person, PersonInput),
    "residences": (Residence, ResidenceInput),
    "tax-cases": (TaxCase, Input),
    "tax-attachments": (TaxAttachment, Input),
}
