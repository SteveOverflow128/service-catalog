from typing import Any

from jsonschema import Draft202012Validator, FormatChecker


def check_against_schema(data: Any, schema: dict) -> list[str]:
    """Validate `data` against the JSON Schema `schema`.

    Returns a list of human-readable error strings. Empty list means valid.

    Format keywords (`uri`, `email`, `date`) are enforced via FormatChecker,
    which picks up the non-GPL format validators pulled in by the
    `jsonschema[format-nongpl]` dependency — keeping this in parity with the
    web pipeline's ajv-formats.
    """
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors: list[str] = []
    for err in validator.iter_errors(data):
        location = "/".join(str(p) for p in err.absolute_path) or "<root>"
        errors.append(f"{location}: {err.message}")
    return errors
