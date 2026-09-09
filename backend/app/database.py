import os
from pathlib import Path
from threading import RLock

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS = DATA_DIR / "uploads"
UPLOADS.mkdir(exist_ok=True)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'maintenance.db'}")
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

Session = sessionmaker(engine, expire_on_commit=False)
# One API worker: serializes writes, exports and restores into consistent snapshots.
data_lock = RLock()
