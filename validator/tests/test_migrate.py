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
