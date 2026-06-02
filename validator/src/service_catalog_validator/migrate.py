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
