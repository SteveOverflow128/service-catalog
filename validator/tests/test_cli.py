import os
import subprocess
import sys
from pathlib import Path

import pytest

from tests.conftest import EXAMPLES_DIR


def _run_cli(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "service_catalog_validator.cli", *args],
        capture_output=True,
        text=True,
    )


def test_cli_valid_file_exits_zero():
    result = _run_cli(str(EXAMPLES_DIR / "service.example.json"))
    assert result.returncode == 0, result.stderr
    assert "OK" in result.stdout or "valid" in result.stdout.lower()


def test_cli_minimal_file_exits_zero():
    result = _run_cli(str(EXAMPLES_DIR / "service.minimal.json"))
    assert result.returncode == 0
    assert "OK" in result.stdout


def test_cli_schema_error_exits_one():
    result = _run_cli(str(EXAMPLES_DIR / "invalid" / "bad-lifecycle-enum.json"))
    assert result.returncode == 1
    assert "lifecycle" in result.stderr


def test_cli_cross_field_error_exits_one():
    result = _run_cli(str(EXAMPLES_DIR / "invalid" / "bad-supports-features-reference.json"))
    assert result.returncode == 1
    assert "Phantom Feature" in result.stderr


def test_cli_missing_file_exits_two(tmp_path: Path):
    missing = tmp_path / "does-not-exist.json"
    result = _run_cli(str(missing))
    assert result.returncode == 2
    assert "not found" in result.stderr.lower() or "no such file" in result.stderr.lower()


def test_cli_malformed_json_exits_two(tmp_path: Path):
    bad = tmp_path / "bad.json"
    bad.write_text("{not valid json")
    result = _run_cli(str(bad))
    assert result.returncode == 2
    assert "json" in result.stderr.lower()


def test_cli_no_argument_exits_two():
    result = _run_cli()
    assert result.returncode == 2


def test_cli_non_utf8_file_exits_two(tmp_path: Path):
    bad = tmp_path / "binary.json"
    bad.write_bytes(b"\xff\xfe\x00\x01 not utf-8")
    result = _run_cli(str(bad))
    assert result.returncode == 2
    assert "read" in result.stderr.lower() or "decode" in result.stderr.lower() or "utf" in result.stderr.lower()


@pytest.mark.skipif(os.geteuid() == 0, reason="root bypasses file permissions")
def test_cli_unreadable_file_exits_two(tmp_path: Path):
    f = tmp_path / "noperm.json"
    f.write_text("{}")
    f.chmod(0o000)
    try:
        result = _run_cli(str(f))
        assert result.returncode == 2
        assert "permission" in result.stderr.lower() or "denied" in result.stderr.lower()
    finally:
        f.chmod(0o644)  # restore so tmp_path cleanup can remove it
