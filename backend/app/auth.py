"""Database-backed first-run setup and multi-user authentication."""
import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from .database import Session, data_lock
from .models import AppSession, AppUser

router = APIRouter(prefix="/auth", tags=["auth"])
SESSION_HOURS = 12
USERNAME = re.compile(r"^[A-Za-z0-9._-]{1,80}$")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash_password(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310000, dklen=32).hex()


def _validate_password(password: str) -> None:
    if len(password) < 12 or len(password) > 256:
        raise HTTPException(422, "Das Passwort muss zwischen 12 und 256 Zeichen lang sein.")


def _public(user: AppUser) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "active": user.active,
        "created_at": user.created_at,
    }


def _active_admins(session) -> int:
    return session.scalar(select(func.count()).select_from(AppUser).where(AppUser.role == "admin", AppUser.active.is_(True))) or 0


def _session_user(session, token: str) -> AppUser:
    if not token:
        raise HTTPException(401, "Anmeldung erforderlich.")
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    row = session.get(AppSession, token_hash)
    if not row:
        raise HTTPException(401, "Sitzung ist ungültig.")
    try:
        expires = datetime.fromisoformat(row.expires_at)
    except ValueError:
        session.delete(row)
        session.commit()
        raise HTTPException(401, "Sitzung ist ungültig.")
    if expires <= _now():
        session.delete(row)
        session.commit()
        raise HTTPException(401, "Sitzung ist abgelaufen.")
    user = session.get(AppUser, row.user_id)
    if not user or not user.active:
        raise HTTPException(401, "Benutzer ist nicht aktiv.")
    return user


def _require_admin(session, token: str) -> AppUser:
    user = _session_user(session, token)
    if user.role != "admin":
        raise HTTPException(403, "Nur Administratoren dürfen Benutzer verwalten.")
    return user


def _new_session(session, user: AppUser) -> tuple[str, int]:
    raw = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    expires = _now() + timedelta(hours=SESSION_HOURS)
    session.add(AppSession(token_hash=token_hash, user_id=user.id, expires_at=expires.isoformat()))
    session.commit()
    return raw, SESSION_HOURS * 60 * 60


@router.get("/status")
def status():
    with data_lock, Session() as session:
        count = session.scalar(select(func.count()).select_from(AppUser)) or 0
    return {"setup_required": count == 0, "user_count": count}


@router.post("/setup", status_code=201)
def setup(payload: dict):
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    if not USERNAME.fullmatch(username):
        raise HTTPException(422, "Benutzername: 1–80 Zeichen, erlaubt sind Buchstaben, Zahlen, Punkt, Minus und Unterstrich.")
    _validate_password(password)
    with data_lock, Session() as session:
        if (session.scalar(select(func.count()).select_from(AppUser)) or 0) != 0:
            raise HTTPException(409, "Die Ersteinrichtung wurde bereits abgeschlossen.")
        salt = secrets.token_bytes(16)
        user = AppUser(
            id=str(uuid4()), username=username, role="admin", active=True,
            password_salt=salt.hex(), password_hash=_hash_password(password, salt),
            created_at=_now().isoformat(),
        )
        session.add(user)
        session.flush()
        token, max_age = _new_session(session, user)
        return {"token": token, "max_age": max_age, "user": _public(user)}


@router.post("/login")
def login(payload: dict):
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    if len(username) > 80 or len(password) > 256:
        raise HTTPException(400, "Ungültige Anmeldung.")
    with data_lock, Session() as session:
        user = session.scalar(select(AppUser).where(AppUser.username == username))
        if not user or not user.active:
            raise HTTPException(401, "Benutzername oder Passwort ist falsch.")
        actual = _hash_password(password, bytes.fromhex(user.password_salt))
        if not secrets.compare_digest(actual, user.password_hash):
            raise HTTPException(401, "Benutzername oder Passwort ist falsch.")
        token, max_age = _new_session(session, user)
        return {"token": token, "max_age": max_age, "user": _public(user)}


@router.get("/session")
def current_session(x_app_session: str = Header(default="", alias="X-App-Session")):
    with data_lock, Session() as session:
        return _public(_session_user(session, x_app_session))


@router.post("/logout")
def logout(x_app_session: str = Header(default="", alias="X-App-Session")):
    if x_app_session:
        token_hash = hashlib.sha256(x_app_session.encode("utf-8")).hexdigest()
        with data_lock, Session() as session:
            row = session.get(AppSession, token_hash)
            if row:
                session.delete(row)
                session.commit()
    return {"logged_out": True}


@router.get("/users")
def list_users(x_app_session: str = Header(default="", alias="X-App-Session")):
    with data_lock, Session() as session:
        _require_admin(session, x_app_session)
        return [_public(row) for row in session.scalars(select(AppUser).order_by(AppUser.username)).all()]


@router.post("/users", status_code=201)
def create_user(payload: dict, x_app_session: str = Header(default="", alias="X-App-Session")):
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    role = str(payload.get("role", "viewer"))
    if not USERNAME.fullmatch(username):
        raise HTTPException(422, "Ungültiger Benutzername.")
    if role not in {"admin", "viewer"}:
        raise HTTPException(422, "Rolle muss admin oder viewer sein.")
    _validate_password(password)
    with data_lock, Session() as session:
        _require_admin(session, x_app_session)
        salt = secrets.token_bytes(16)
        user = AppUser(id=str(uuid4()), username=username, role=role, active=True,
                       password_salt=salt.hex(), password_hash=_hash_password(password, salt),
                       created_at=_now().isoformat())
        session.add(user)
        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            raise HTTPException(409, "Dieser Benutzername existiert bereits.") from exc
        return _public(user)


@router.put("/users/{user_id}")
def update_user(user_id: str, payload: dict, x_app_session: str = Header(default="", alias="X-App-Session")):
    with data_lock, Session() as session:
        _require_admin(session, x_app_session)
        user = session.get(AppUser, user_id)
        if not user:
            raise HTTPException(404, "Benutzer nicht gefunden.")
        username = str(payload.get("username", user.username)).strip()
        role = str(payload.get("role", user.role))
        active = bool(payload.get("active", user.active))
        password = str(payload.get("password", ""))
        if not USERNAME.fullmatch(username):
            raise HTTPException(422, "Ungültiger Benutzername.")
        if role not in {"admin", "viewer"}:
            raise HTTPException(422, "Rolle muss admin oder viewer sein.")
        removes_admin = user.role == "admin" and user.active and (role != "admin" or not active)
        if removes_admin and _active_admins(session) <= 1:
            raise HTTPException(409, "Der letzte aktive Administrator kann nicht deaktiviert oder zum Viewer gemacht werden.")
        user.username, user.role, user.active = username, role, active
        if password:
            _validate_password(password)
            salt = secrets.token_bytes(16)
            user.password_salt = salt.hex()
            user.password_hash = _hash_password(password, salt)
            session.query(AppSession).filter(AppSession.user_id == user.id).delete(synchronize_session=False)
        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            raise HTTPException(409, "Dieser Benutzername existiert bereits.") from exc
        return _public(user)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: str, x_app_session: str = Header(default="", alias="X-App-Session")):
    with data_lock, Session() as session:
        current = _require_admin(session, x_app_session)
        user = session.get(AppUser, user_id)
        if not user:
            raise HTTPException(404, "Benutzer nicht gefunden.")
        if user.id == current.id:
            raise HTTPException(409, "Das aktuell angemeldete Administratorkonto kann nicht gelöscht werden.")
        if user.role == "admin" and user.active and _active_admins(session) <= 1:
            raise HTTPException(409, "Der letzte aktive Administrator kann nicht gelöscht werden.")
        session.query(AppSession).filter(AppSession.user_id == user.id).delete(synchronize_session=False)
        session.delete(user)
        session.commit()
