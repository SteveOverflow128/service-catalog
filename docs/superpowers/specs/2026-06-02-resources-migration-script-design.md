# Design: `service-catalog-migrate` — old→new format migration

- **Date:** 2026-06-02
- **Status:** Approved (pending spec review)
- **Topic:** A CLI that migrates service documents from the legacy `awsServices` shape to the provider-agnostic `resources` shape.

## Context

The catalog schema recently replaced the AWS-only `awsServices` array with a provider-agnostic
`resources` array: each item now requires a `provider` enum (`aws | azure | on-prem`), and the
AWS-specific `rdsPrimaryInstanceCount` field was renamed `primaryInstanceCount`
(see `2026-06-01-multi-cloud-resources-design.md`). Existing `service.json` documents written in
the old shape no longer validate. We need a tool to mechanically migrate them.

The validator package (`validator/`) is the schema-aware, pytest-tested home for catalog tooling
and already ships a console script (`service-catalog-validate`) with a clean CLI convention
(single file **or** directory, exit codes 0/1/2). The migrator mirrors that.

## Goals

- Convert legacy documents (single file or directory tree) to the new `resources` shape.
- Be safe and reviewable: in-place edits with a `--dry-run`, minimal git diffs, idempotent re-runs.
- Reuse the existing validator to confirm migrated documents are schema-valid.

## Non-goals (explicitly out of scope)

- **Provider inference** and a `--default-provider` flag — legacy data was AWS-only by definition;
  every migrated item gets `provider: "aws"`. (User decision.)
- **Backup files** — the repo is git-tracked; git is the backstop.
- **Merging** when a document already has both `awsServices` and `resources` — that is treated as a
  conflict and left untouched for a human.
- Touching the web app, schema, or sample-data generator.

## Decision

Add a `service-catalog-migrate` console script to the validator package. A pure transform module
does the document rewrite; a thin CLI module handles file/directory walking, `--dry-run`, writing,
and post-migration validation.

## Transform contract (`migrate.py`, pure, no I/O)

```python
class MigrationStatus(str, Enum):
    MIGRATED = "migrated"
    UNCHANGED = "unchanged"
    CONFLICT = "conflict"

def migrate_document(doc: dict) -> tuple[dict, MigrationStatus]:
    ...
```

`migrate_document` returns a **new** dict (it does not mutate its input) plus a status:

- **`awsServices` present, `resources` absent → `MIGRATED`.**
  - Rename the `awsServices` key to `resources` **at the same position** (rebuild the dict so the
    key order is otherwise unchanged → minimal git diff).
  - If the value is a list, for each item that is a dict:
    - Insert `provider: "aws"` as the **first** key, unless the item already has a `provider`
      (an existing provider value is preserved, never overwritten).
    - If `rdsPrimaryInstanceCount` is present, rename it to `primaryInstanceCount` **in place**
      (same position).
    - Non-dict items (anomalous) are left as-is.
  - If the value is not a list (anomalous), only the key is renamed; the value is left as-is.
  - An empty array (`awsServices: []`) still counts as `MIGRATED` (the key changed).
- **`awsServices` present AND `resources` present → `CONFLICT`.** Return the doc unchanged.
- **Neither branch (no `awsServices`) → `UNCHANGED`.** Return the doc unchanged. This is what makes
  re-running the migrator a no-op (idempotent): the output of a migration has no `awsServices`, so a
  second pass reports `UNCHANGED`.

## CLI contract (`migrate_cli.py`)

```
service-catalog-migrate <path> [--dry-run]
```

- `path` is a single `service.json` **or** a directory (recurses `*.json`, sorted) — mirrors
  `service-catalog-validate`.
- `--dry-run` — report what *would* change; write nothing.
- **Writing:** migrated files are rewritten with `json.dumps(doc, indent=2, ensure_ascii=False)`
  plus a trailing newline (matches the repo's 2-space + newline convention).
- **Per-file output:**
  - `MIGRATED: <path> (<n> resource(s))` (stdout) — or, under `--dry-run`,
    `would migrate: <path> (<n> resource(s))`.
  - `unchanged: <path>` (stdout).
  - `SKIPPED (conflict): <path> has both awsServices and resources` (stderr).
- **Post-migration validation:** after writing a migrated file (skipped under `--dry-run`), run the
  existing `validate()` on the result; if invalid, emit
  `warning: <path> still has schema issues after migration:` followed by the errors (stderr).
  Warnings do **not** change the exit code — pre-existing schema problems are a separate concern
  from the format migration.
- **Directory mode** prints a final summary line: `migrated N, unchanged M, skipped K` (and
  `, errors E` when any file failed to read/parse).

### Exit codes (mirroring the validator)

| Code | Meaning |
|------|---------|
| `0` | Success — migrations applied (or nothing to do), no conflicts, no read/parse errors. |
| `1` | At least one `CONFLICT`, or (directory mode) at least one unreadable / malformed-JSON file. |
| `2` | Pre-flight failure — directory has no `*.json` files; or (single-file mode) the file is missing, unreadable, or malformed JSON. |

(Single-file malformed/unreadable → `2`, matching `service-catalog-validate`. In directory mode a
bad file is reported, counted as an error, and yields exit `1` — also matching the validator.)

## Files

- **Create** `validator/src/service_catalog_validator/migrate.py` — `MigrationStatus` enum +
  `migrate_document` (pure transform, no I/O).
- **Create** `validator/src/service_catalog_validator/migrate_cli.py` — argparse CLI, file/dir
  walking, `--dry-run`, writing, post-migration `validate()` warnings, exit codes.
- **Modify** `validator/pyproject.toml` — add
  `service-catalog-migrate = "service_catalog_validator.migrate_cli:main"` under `[project.scripts]`.
- **Create** `validator/tests/test_migrate.py` — pure-transform unit tests (TDD).
- **Create** `validator/tests/test_migrate_cli.py` — CLI tests via `tmp_path` (TDD).

The transform and the CLI are deliberately separate modules: the transform is pure and trivially
unit-tested; the CLI owns all I/O, walking, and reporting.

## Testing strategy (TDD — write tests first)

**`test_migrate.py` (pure transform):**
- `awsServices` → `resources`, key renamed and at the original position.
- Each migrated item gains `provider: "aws"` as its first key.
- An item that already has `provider: "azure"` keeps it (not overwritten).
- `rdsPrimaryInstanceCount` → `primaryInstanceCount` (value preserved).
- A document with no `awsServices` returns `UNCHANGED` and is byte-for-byte equal.
- A document with both `awsServices` and `resources` returns `CONFLICT`, unchanged.
- Empty `awsServices: []` returns `MIGRATED` with `resources: []`.
- Idempotency: feeding a migrated document back in returns `UNCHANGED`.
- The input dict is not mutated (the function returns a new object).

**`test_migrate_cli.py` (CLI via `tmp_path`):**
- Single legacy file is rewritten in place; content now has `resources` with `provider: "aws"`;
  exit `0`.
- `--dry-run` on a legacy file leaves the file byte-for-byte unchanged but prints `would migrate`;
  exit `0`.
- Directory with a mix of legacy + already-new + conflict files: legacy ones migrate, new ones are
  `unchanged`, conflict file is skipped; exit `1`; summary counts correct.
- Directory with no `*.json` files → exit `2`.
- Single malformed-JSON file → exit `2`.
- Second run over an already-migrated directory is a no-op (all `unchanged`); exit `0`.

The migrated example from the multi-cloud work (`examples/service.example.json`) is already in the
new shape, so it must report `unchanged`.

## Self-review (completed during authoring)

- No placeholders; the transform and CLI contracts are concrete.
- Exit-code semantics are consistent with `service-catalog-validate` (single-file pre-flight → `2`;
  directory bad-file → `1`).
- Idempotency follows from the `UNCHANGED`-when-no-`awsServices` rule — internally consistent.
- Scope is a single, focused plan (two small modules + tests + one pyproject line).
</content>
