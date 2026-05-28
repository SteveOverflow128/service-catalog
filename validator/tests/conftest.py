import json
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "schema" / "service-catalog.schema.json"
EXAMPLES_DIR = REPO_ROOT / "examples"


@pytest.fixture(scope="session")
def schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text())


@pytest.fixture
def valid_example() -> dict:
    return json.loads((EXAMPLES_DIR / "service.example.json").read_text())


@pytest.fixture
def minimal_example() -> dict:
    return json.loads((EXAMPLES_DIR / "service.minimal.json").read_text())


def load_invalid(name: str) -> dict:
    return json.loads((EXAMPLES_DIR / "invalid" / name).read_text())
