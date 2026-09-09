import os
import tempfile

import pytest

test_dir = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = test_dir.name
os.environ["DATABASE_URL"] = "sqlite:///" + test_dir.name + "/test.db"

from app.database import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def cleanup_database():
    yield
    engine.dispose()
    test_dir.cleanup()


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    with TestClient(app) as client:
        yield client
