import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .cross_field import check_cross_field
from .schema_check import check_against_schema


_REPO_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_SCHEMA_PATH = _REPO_ROOT / "schema" / "service-catalog.schema.json"


@dataclass(frozen=True)
class ValidationResult:
    is_valid: bool
    errors: tuple[str, ...] = field(default_factory=tuple)


def validate(data: Any, schema: dict | None = None) -> ValidationResult:
    """Validate a service.json document.

    Runs JSON Schema validation first, then the cross-field rule.
    Both error sets are collected and returned together.

    When validating many documents in a loop, pass a pre-loaded ``schema``
    dict to avoid re-reading the schema file on every call.
    """
    if schema is None:
        schema = json.loads(_DEFAULT_SCHEMA_PATH.read_text())

    errors = check_against_schema(data, schema) + check_cross_field(data)
    return ValidationResult(is_valid=not errors, errors=tuple(errors))
