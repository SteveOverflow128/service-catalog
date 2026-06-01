import json
import subprocess
import sys


def _run_cli(*args):
    return subprocess.run(
        [sys.executable, "-m", "service_catalog_validator.cli", *args],
        capture_output=True,
        text=True,
    )


def _doc(service_id, dependencies=None):
    doc = {
        "serviceId": service_id,
        "name": service_id,
        "team": "T",
        "teamEmail": "t@example.com",
        "lifecycle": "prod",
        "criticalityTier": 3,
        "repository": "https://example.com",
        "dataClassification": "INTERNAL",
    }
    if dependencies is not None:
        doc["dependencies"] = dependencies
    return doc


def _dep(service_id, external=False):
    return {
        "serviceId": service_id,
        "interaction": "sync-http",
        "critical": False,
        "purpose": "p",
        "external": external,
    }


def _write(dir_path, filename, doc):
    (dir_path / filename).write_text(json.dumps(doc))


def test_cli_directory_all_valid_exits_zero(tmp_path):
    _write(tmp_path, "a.json", _doc("a", [_dep("b")]))
    _write(tmp_path, "b.json", _doc("b"))
    result = _run_cli(str(tmp_path))
    assert result.returncode == 0, result.stderr
    assert "OK" in result.stdout


def test_cli_directory_dangling_dependency_exits_one(tmp_path):
    _write(tmp_path, "a.json", _doc("a", [_dep("ghost")]))
    result = _run_cli(str(tmp_path))
    assert result.returncode == 1
    assert "ghost" in result.stderr


def test_cli_directory_duplicate_service_id_exits_one(tmp_path):
    _write(tmp_path, "a.json", _doc("a"))
    _write(tmp_path, "a-copy.json", _doc("a"))
    result = _run_cli(str(tmp_path))
    assert result.returncode == 1
    assert "duplicate" in result.stderr.lower()


def test_cli_directory_schema_invalid_file_exits_one(tmp_path):
    bad = _doc("bad")
    bad["lifecycle"] = "production"  # not in the enum
    _write(tmp_path, "bad.json", bad)
    result = _run_cli(str(tmp_path))
    assert result.returncode == 1
    assert "lifecycle" in result.stderr


def test_cli_empty_directory_exits_two(tmp_path):
    result = _run_cli(str(tmp_path))
    assert result.returncode == 2
