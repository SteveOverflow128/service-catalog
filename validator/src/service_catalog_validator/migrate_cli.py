import argparse
import json
import sys
from pathlib import Path

from .migrate import MigrationStatus, migrate_document
from .validator import validate


def _resource_count(doc: dict) -> int:
    res = doc.get("resources")
    return len(res) if isinstance(res, list) else 0


def _report_validation(path: Path, doc: dict) -> None:
    result = validate(doc)
    if not result.is_valid:
        print(f"warning: {path} still has schema issues after migration:", file=sys.stderr)
        for err in result.errors:
            print(f"  - {err}", file=sys.stderr)


def _migrate_one(path: Path, dry_run: bool) -> MigrationStatus:
    """Load, migrate, and (when migrated and not dry-run) rewrite one file.
    Raises OSError/UnicodeDecodeError/json.JSONDecodeError on read/parse failure."""
    data = json.loads(path.read_text(encoding="utf-8"))
    new_doc, status = migrate_document(data)
    if status is MigrationStatus.MIGRATED:
        n = _resource_count(new_doc)
        if dry_run:
            print(f"would migrate: {path} ({n} resource(s))")
        else:
            path.write_text(json.dumps(new_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"MIGRATED: {path} ({n} resource(s))")
            _report_validation(path, new_doc)
    elif status is MigrationStatus.UNCHANGED:
        print(f"unchanged: {path}")
    else:  # CONFLICT
        print(f"SKIPPED (conflict): {path} has both awsServices and resources", file=sys.stderr)
    return status


def _migrate_directory(directory: Path, dry_run: bool) -> int:
    files = sorted(directory.rglob("*.json"))
    if not files:
        print(f"error: no .json files found in {directory}", file=sys.stderr)
        return 2

    counts = {s: 0 for s in MigrationStatus}
    errors = 0
    for f in files:
        try:
            counts[_migrate_one(f, dry_run)] += 1
        except (OSError, UnicodeDecodeError) as exc:
            print(f"error: cannot read {f}: {exc}", file=sys.stderr)
            errors += 1
        except json.JSONDecodeError as exc:
            print(f"error: malformed JSON in {f}: {exc}", file=sys.stderr)
            errors += 1

    summary = (
        f"migrated {counts[MigrationStatus.MIGRATED]}, "
        f"unchanged {counts[MigrationStatus.UNCHANGED]}, "
        f"skipped {counts[MigrationStatus.CONFLICT]}"
    )
    if errors:
        summary += f", errors {errors}"
    print(summary)

    return 1 if (counts[MigrationStatus.CONFLICT] or errors) else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="service-catalog-migrate",
        description="Migrate service.json documents from the legacy awsServices shape to the resources shape.",
    )
    parser.add_argument("path", help="Path to a service.json file, or a directory of them")
    parser.add_argument("--dry-run", action="store_true", help="Report what would change without writing")
    args = parser.parse_args(argv)

    path = Path(args.path)
    if path.is_dir():
        return _migrate_directory(path, args.dry_run)
    if not path.is_file():
        print(f"error: file not found: {path}", file=sys.stderr)
        return 2

    try:
        status = _migrate_one(path, args.dry_run)
    except PermissionError:
        print(f"error: permission denied reading {path}", file=sys.stderr)
        return 2
    except (OSError, UnicodeDecodeError) as exc:
        print(f"error: cannot read {path}: {exc}", file=sys.stderr)
        return 2
    except json.JSONDecodeError as exc:
        print(f"error: malformed JSON in {path}: {exc}", file=sys.stderr)
        return 2

    return 1 if status is MigrationStatus.CONFLICT else 0


if __name__ == "__main__":
    raise SystemExit(main())
