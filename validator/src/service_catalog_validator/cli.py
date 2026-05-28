import argparse
import json
import sys
from pathlib import Path

from .validator import validate


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="service-catalog-validate",
        description="Validate a service.json file against the service catalog schema.",
    )
    parser.add_argument("path", help="Path to a service.json file")
    args = parser.parse_args(argv)

    path = Path(args.path)
    if not path.is_file():
        print(f"error: file not found: {path}", file=sys.stderr)
        return 2

    # Exit 2 for all pre-validation failures (missing/unreadable file, bad
    # encoding, malformed JSON). The specific cause is in the stderr message,
    # not the exit code.
    try:
        raw = path.read_text(encoding="utf-8")
    except PermissionError:
        print(f"error: permission denied reading {path}", file=sys.stderr)
        return 2
    except (OSError, UnicodeDecodeError) as exc:
        print(f"error: cannot read {path}: {exc}", file=sys.stderr)
        return 2

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"error: malformed JSON in {path}: {exc}", file=sys.stderr)
        return 2

    result = validate(data)
    if result.is_valid:
        print(f"OK: {path}")
        return 0

    print(f"INVALID: {path}", file=sys.stderr)
    for err in result.errors:
        print(f"  - {err}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
