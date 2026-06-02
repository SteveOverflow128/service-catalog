from enum import Enum

# Legacy instance-count field names that have collapsed into `dbInstanceCount`.
# `rdsPrimaryInstanceCount` was the original; `primaryInstanceCount` was an
# intermediate name shipped by an earlier version of this tool.
_INSTANCE_COUNT_ALIASES = ("rdsPrimaryInstanceCount", "primaryInstanceCount")


class MigrationStatus(str, Enum):
    MIGRATED = "migrated"
    UNCHANGED = "unchanged"
    CONFLICT = "conflict"


def _rename_key(d: dict, old: str, new: str) -> dict:
    """Copy of `d` with key `old` renamed to `new`, preserving insertion order."""
    return {(new if k == old else k): v for k, v in d.items()}


def _rename_instance_count(item):
    """Rename a legacy instance-count key to `dbInstanceCount`, preserving its
    position. No-op for non-dict items or items that already use the new name.
    Returns the same object when nothing changes."""
    if not isinstance(item, dict) or "dbInstanceCount" in item:
        return item
    for alias in _INSTANCE_COUNT_ALIASES:
        if alias in item:
            return _rename_key(item, alias, "dbInstanceCount")
    return item


def _migrate_aws_item(item):
    """Legacy `awsServices` item -> `resources` item: add `provider: aws` as the
    first key (unless one already exists) and normalize the instance-count field.
    Non-dict items pass through untouched."""
    if not isinstance(item, dict):
        return item
    return _rename_instance_count({"provider": "aws", **item})


def migrate_document(doc: dict) -> tuple[dict, MigrationStatus]:
    """Migrate a service document to the current `resources` shape. Handles both
    legacy stages, so re-running is always safe:

      1. `awsServices` -> `resources` (+ `provider`, + instance-count rename).
      2. a doc already on `resources` whose items still carry the older
         `primaryInstanceCount` / `rdsPrimaryInstanceCount` -> `dbInstanceCount`.
         (Stage 2 only renames the instance-count field; it does not synthesize
         `provider` on resources that lack it.)

    Returns a new document plus a status; never mutates input."""
    has_aws = "awsServices" in doc
    has_resources = "resources" in doc

    if has_aws and has_resources:
        return doc, MigrationStatus.CONFLICT

    if has_aws:
        new_doc: dict = {}
        for key, value in doc.items():
            if key == "awsServices":
                new_doc["resources"] = (
                    [_migrate_aws_item(it) for it in value] if isinstance(value, list) else value
                )
            else:
                new_doc[key] = value
        return new_doc, MigrationStatus.MIGRATED

    if has_resources and isinstance(doc["resources"], list):
        new_items = [_rename_instance_count(it) for it in doc["resources"]]
        if new_items != doc["resources"]:
            return {**doc, "resources": new_items}, MigrationStatus.MIGRATED

    return doc, MigrationStatus.UNCHANGED
