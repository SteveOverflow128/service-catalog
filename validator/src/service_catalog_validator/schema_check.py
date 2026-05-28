from typing import Any

from jsonschema import Draft202012Validator, FormatChecker


def check_against_schema(data: Any, schema: dict) -> list[str]:
    """Validate `data` against the JSON Schema `schema`.

    Returns a list of human-readable error strings. Empty list means valid.

    The `email` format is enforced via FormatChecker (a basic "@"-presence
    check). The `uri` format is NOT enforced — jsonschema requires optional
    dependencies (jsonschema[format]) to check it, which are not installed
    in this phase. Treat `format: uri` declarations as advisory.
    """
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors: list[str] = []
    for err in validator.iter_errors(data):
        location = "/".join(str(p) for p in err.absolute_path) or "<root>"
        errors.append(f"{location}: {err.message}")
    return errors
