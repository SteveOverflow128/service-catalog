import argparse
import json
import sys
from pathlib import Path

from .catalog_check import check_catalog
from .validator import validate


def _validate_directory(directory: Path) -> int:
    """Validate every *.json file under `directory`, then run catalog-wide
    checks (duplicate ids, dangling dependencies) across all of them.

    Exit 0 if everything is valid, 1 if any file or the catalog is invalid,
    2 if the directory has no .json files to validate.
    """
    files = sorted(directory.rglob("*.json"))
    if not files:
        print(f"error: no .json files found in {directory}", file=sys.stderr)
        return 2

    documents: list[dict] = []
    file_errors: list[tuple[Path, tuple[str, ...]]] = []
    read_failed = False

    for f in files:
        try:
            raw = f.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            print(f"error: cannot read {f}: {exc}", file=sys.stderr)
            read_failed = True
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            print(f"error: malformed JSON in {f}: {exc}", file=sys.stderr)
            read_failed = True
            continue

        result = validate(data)
        if not result.is_valid:
            file_errors.append((f, result.errors))
        documents.append(data)

    catalog_errors = check_catalog(documents)

    if not file_errors and not catalog_errors and not read_failed:
        print(f"OK: {len(documents)} service(s) in {directory}")
        return 0

    for f, errs in file_errors:
        print(f"INVALID: {f}", file=sys.stderr)
        for err in errs:
            print(f"  - {err}", file=sys.stderr)

    if catalog_errors:
        print(f"INVALID CATALOG: {directory}", file=sys.stderr)
        for err in catalog_errors:
            print(f"  - {err}", file=sys.stderr)

    return 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="service-catalog-validate",
        description="Validate a service.json file (or a directory of them) against the service catalog schema.",
    )
    parser.add_argument("path", help="Path to a service.json file, or a directory of them")
    args = parser.parse_args(argv)

    path = Path(args.path)
    if path.is_dir():
        return _validate_directory(path)
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
