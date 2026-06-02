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
    assert item["dbInstanceCount"] == 2


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


# --- Stage-1 docs: already on `resources`, but with the older instance-count name ---


def test_resources_only_primary_instance_count_migrates():
    src = {"serviceId": "x", "resources": [
        {"provider": "aws", "type": "rds", "purpose": "p", "primaryInstanceCount": 3},
    ]}
    doc, status = migrate_document(src)
    assert status is MigrationStatus.MIGRATED
    item = doc["resources"][0]
    assert "primaryInstanceCount" not in item
    assert item["dbInstanceCount"] == 3
    assert item["provider"] == "aws"  # left untouched, not re-derived


def test_resources_only_rds_primary_instance_count_migrates():
    src = {"resources": [{"provider": "aws", "type": "rds", "purpose": "p", "rdsPrimaryInstanceCount": 1}]}
    doc, status = migrate_document(src)
    assert status is MigrationStatus.MIGRATED
    assert doc["resources"][0]["dbInstanceCount"] == 1


def test_resources_only_does_not_synthesize_provider():
    src = {"resources": [{"type": "rds", "purpose": "p", "primaryInstanceCount": 1}]}
    doc, status = migrate_document(src)
    assert status is MigrationStatus.MIGRATED
    assert "provider" not in doc["resources"][0]
    assert doc["resources"][0]["dbInstanceCount"] == 1


def test_resources_only_already_db_instance_count_is_unchanged():
    src = {"resources": [{"provider": "aws", "type": "rds", "purpose": "p", "dbInstanceCount": 3}]}
    doc, status = migrate_document(src)
    assert status is MigrationStatus.UNCHANGED
    assert doc == src


def test_both_legacy_stages_converge():
    stage0 = {"awsServices": [{"type": "rds", "purpose": "p", "rdsPrimaryInstanceCount": 2}]}
    stage1 = {"resources": [{"provider": "aws", "type": "rds", "purpose": "p", "primaryInstanceCount": 2}]}
    from_stage0, _ = migrate_document(stage0)
    from_stage1, st1 = migrate_document(stage1)
    assert st1 is MigrationStatus.MIGRATED
    assert from_stage0["resources"][0]["dbInstanceCount"] == 2
    assert from_stage1["resources"][0]["dbInstanceCount"] == 2


def test_stage1_migration_is_idempotent():
    src = {"resources": [{"provider": "aws", "type": "rds", "purpose": "p", "primaryInstanceCount": 2}]}
    once, _ = migrate_document(src)
    twice, status = migrate_document(once)
    assert status is MigrationStatus.UNCHANGED
    assert twice == once
