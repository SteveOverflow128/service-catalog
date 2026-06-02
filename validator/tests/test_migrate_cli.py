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
