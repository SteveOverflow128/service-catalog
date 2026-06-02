# `service-catalog-migrate` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A `service-catalog-migrate` CLI in the validator package that rewrites legacy `awsServices` service documents into the provider-agnostic `resources` shape.

**Architecture:** A pure transform module (`migrate.py`, no I/O) does the document rewrite; a thin CLI (`migrate_cli.py`) handles file/dir walking, `--dry-run`, writing, and post-migration validation. Mirrors the existing `service-catalog-validate` CLI conventions.

**Tech Stack:** Python 3.12, stdlib `argparse`/`json`, pytest. Reuses `service_catalog_validator.validator.validate`.

**Spec:** `docs/superpowers/specs/2026-06-02-resources-migration-script-design.md`

---

## Task 1: Pure transform (`migrate.py`) — TDD

**Files:**
- Create: `validator/tests/test_migrate.py`
- Create: `validator/src/service_catalog_validator/migrate.py`

- [ ] **Step 1: Write the failing tests** — `validator/tests/test_migrate.py`

```python
import copy

from service_catalog_validator.migrate import migrate_document, MigrationStatus


def _legacy():
    return {
        "serviceId": "x",
        "name": "X",
        "awsServices": [
            {"type": "rds", "purpose": "store", "rdsPrimaryInstanceCount": 2},
            {"type": "sqs", "purpose": "queue"},
        ],
        "tags": {"a": "b"},
    }


def test_renames_awsservices_to_resources_in_place():
    doc, status = migrate_document(_legacy())
    assert status is MigrationStatus.MIGRATED
    assert "awsServices" not in doc
    assert list(doc.keys()) == ["serviceId", "name", "resources", "tags"]


def test_adds_provider_aws_as_first_key():
    doc, _ = migrate_document(_legacy())
    item = doc["resources"][0]
    assert item["provider"] == "aws"
    assert list(item.keys())[0] == "provider"


def test_existing_provider_not_overwritten():
    src = {"awsServices": [{"provider": "azure", "type": "azure-sql", "purpose": "db"}]}
    doc, status = migrate_document(src)
    assert status is MigrationStatus.MIGRATED
    assert doc["resources"][0]["provider"] == "azure"


def test_renames_rds_primary_instance_count():
    item = migrate_document(_legacy())[0]["resources"][0]
    assert "rdsPrimaryInstanceCount" not in item
    assert item["primaryInstanceCount"] == 2


def test_no_awsservices_is_unchanged():
    src = {"serviceId": "x", "resources": [{"provider": "aws", "type": "rds", "purpose": "p"}]}
    doc, status = migrate_document(src)
    assert status is MigrationStatus.UNCHANGED
    assert doc == src


def test_both_keys_is_conflict():
    src = {"awsServices": [{"type": "rds", "purpose": "p"}], "resources": []}
    doc, status = migrate_document(src)
    assert status is MigrationStatus.CONFLICT
    assert doc == src


def test_empty_awsservices_migrates_to_empty_resources():
    doc, status = migrate_document({"awsServices": []})
    assert status is MigrationStatus.MIGRATED
    assert doc["resources"] == []


def test_idempotent():
    once, s1 = migrate_document(_legacy())
    twice, s2 = migrate_document(once)
    assert s1 is MigrationStatus.MIGRATED
    assert s2 is MigrationStatus.UNCHANGED
    assert twice == once


def test_input_not_mutated():
    src = _legacy()
    snapshot = copy.deepcopy(src)
    migrate_document(src)
    assert src == snapshot
```

- [ ] **Step 2: Run — verify FAIL**

Run (from `validator/`): `pytest tests/test_migrate.py -q`
Expected: collection/import error (module `migrate` doesn't exist).

- [ ] **Step 3: Implement** — `validator/src/service_catalog_validator/migrate.py`

```python
from enum import Enum


class MigrationStatus(str, Enum):
    MIGRATED = "migrated"
    UNCHANGED = "unchanged"
    CONFLICT = "conflict"


def _rename_key(d: dict, old: str, new: str) -> dict:
    """Copy of `d` with key `old` renamed to `new`, preserving insertion order."""
    return {(new if k == old else k): v for k, v in d.items()}


def _migrate_item(item):
    """Add `provider: aws` as the first key (unless one already exists) and
    rename `rdsPrimaryInstanceCount` -> `primaryInstanceCount`. Non-dict items
    pass through untouched."""
    if not isinstance(item, dict):
        return item
    migrated = {"provider": "aws", **item}  # existing provider value wins, stays first
    if "rdsPrimaryInstanceCount" in migrated:
        migrated = _rename_key(migrated, "rdsPrimaryInstanceCount", "primaryInstanceCount")
    return migrated


def migrate_document(doc: dict) -> tuple[dict, MigrationStatus]:
    """Migrate a service document from the legacy `awsServices` shape to the
    `resources` shape. Returns a new document plus a status; never mutates input."""
    if "awsServices" not in doc:
        return doc, MigrationStatus.UNCHANGED
    if "resources" in doc:
        return doc, MigrationStatus.CONFLICT

    new_doc: dict = {}
    for key, value in doc.items():
        if key == "awsServices":
            new_doc["resources"] = (
                [_migrate_item(it) for it in value] if isinstance(value, list) else value
            )
        else:
            new_doc[key] = value
    return new_doc, MigrationStatus.MIGRATED
```

- [ ] **Step 4: Run — verify PASS**

Run: `pytest tests/test_migrate.py -q` → all pass.

- [ ] **Step 5: Commit**

```bash
git add validator/src/service_catalog_validator/migrate.py validator/tests/test_migrate.py
git commit -m "feat(validator): pure awsServices->resources document transform

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: CLI (`migrate_cli.py`) + console script — TDD

**Files:**
- Create: `validator/tests/test_migrate_cli.py`
- Create: `validator/src/service_catalog_validator/migrate_cli.py`
- Modify: `validator/pyproject.toml` (add `[project.scripts]` entry)

- [ ] **Step 1: Write the failing tests** — `validator/tests/test_migrate_cli.py`

```python
import json
from pathlib import Path

from service_catalog_validator.migrate_cli import main


def _write(p: Path, doc: dict):
    p.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")


LEGACY = {
    "serviceId": "task-service",
    "name": "Task Service",
    "team": "T",
    "teamEmail": "t@example.com",
    "lifecycle": "prod",
    "criticalityTier": 1,
    "repository": "https://example.com/x",
    "dataClassification": "INTERNAL",
    "awsServices": [{"type": "rds", "purpose": "store"}],
}


def test_single_file_migrated_in_place(tmp_path):
    f = tmp_path / "service.json"
    _write(f, LEGACY)
    assert main([str(f)]) == 0
    out = json.loads(f.read_text())
    assert "awsServices" not in out
    assert out["resources"][0]["provider"] == "aws"


def test_dry_run_writes_nothing(tmp_path, capsys):
    f = tmp_path / "service.json"
    _write(f, LEGACY)
    before = f.read_text()
    assert main([str(f), "--dry-run"]) == 0
    assert f.read_text() == before
    assert "would migrate" in capsys.readouterr().out


def test_directory_mixed(tmp_path, capsys):
    _write(tmp_path / "a.json", LEGACY)
    _write(tmp_path / "b.json", {"serviceId": "b", "resources": []})
    _write(tmp_path / "c.json", {**LEGACY, "serviceId": "c", "resources": []})
    rc = main([str(tmp_path)])
    out = capsys.readouterr().out
    assert rc == 1  # conflict present
    assert "migrated 1" in out and "unchanged 1" in out and "skipped 1" in out


def test_empty_directory_exit_2(tmp_path):
    assert main([str(tmp_path)]) == 2


def test_malformed_json_single_file_exit_2(tmp_path):
    f = tmp_path / "bad.json"
    f.write_text("{ not json", encoding="utf-8")
    assert main([str(f)]) == 2


def test_idempotent_second_run(tmp_path, capsys):
    f = tmp_path / "service.json"
    _write(f, LEGACY)
    assert main([str(f)]) == 0
    capsys.readouterr()
    assert main([str(f)]) == 0
    assert "unchanged" in capsys.readouterr().out


def test_post_migration_validation_warns_but_succeeds(tmp_path, capsys):
    # legacy but missing required top-level fields -> still invalid after migration
    f = tmp_path / "partial.json"
    _write(f, {"serviceId": "x", "awsServices": [{"type": "rds", "purpose": "p"}]})
    assert main([str(f)]) == 0  # migration itself succeeded
    assert "still has schema issues" in capsys.readouterr().err
    assert "awsServices" not in json.loads(f.read_text())
```

- [ ] **Step 2: Run — verify FAIL**

Run: `pytest tests/test_migrate_cli.py -q` → import error (no `migrate_cli`).

- [ ] **Step 3: Implement** — `validator/src/service_catalog_validator/migrate_cli.py`

```python
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
```

- [ ] **Step 4: Add the console script** — `validator/pyproject.toml`

Under `[project.scripts]`, add the second line:
```toml
[project.scripts]
service-catalog-validate = "service_catalog_validator.cli:main"
service-catalog-migrate = "service_catalog_validator.migrate_cli:main"
```
Then reinstall so the entry point resolves: from `validator/`, `pip install -e '.[dev]'`.

- [ ] **Step 5: Run — verify PASS (whole suite)**

Run (from `validator/`): `pytest -q` → all pass (existing 48 + new transform/CLI tests).

- [ ] **Step 6: Commit**

```bash
git add validator/src/service_catalog_validator/migrate_cli.py validator/tests/test_migrate_cli.py validator/pyproject.toml
git commit -m "feat(validator): add service-catalog-migrate CLI

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review
- Spec coverage: transform contract (Task 1) and CLI contract incl. dry-run/dir/exit-codes/post-validation (Task 2) both covered.
- Type consistency: `MigrationStatus` enum and `migrate_document` signature match across modules and tests.
- No placeholders.
</content>
