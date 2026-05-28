from service_catalog_validator.validator import ValidationResult, validate
from tests.conftest import load_invalid


def test_valid_example_returns_ok(valid_example):
    result = validate(valid_example)
    assert isinstance(result, ValidationResult)
    assert result.is_valid is True
    assert result.errors == ()


def test_minimal_example_returns_ok(minimal_example):
    result = validate(minimal_example)
    assert result.is_valid is True


def test_schema_error_surfaces():
    data = load_invalid("bad-lifecycle-enum.json")
    result = validate(data)
    assert result.is_valid is False
    assert any("lifecycle" in e for e in result.errors)


def test_cross_field_error_surfaces():
    data = load_invalid("bad-supports-features-reference.json")
    result = validate(data)
    assert result.is_valid is False
    assert any("Phantom Feature" in e for e in result.errors)


def test_combined_errors_reported_together():
    """A document with BOTH a schema error AND a cross-field error
    surfaces both in result.errors."""
    data = {
        "serviceId": "broken",
        "name": "Broken",
        "team": "T",
        "teamEmail": "x@example.com",
        "lifecycle": "production",          # schema error
        "criticalityTier": 3,
        "repository": "https://example.com",
        "containsPHI": False,
        "containsPII": False,
        "features": [{"name": "Real"}],
        "dependencies": [
            {
                "serviceId": "x", "interaction": "sync-http", "critical": False,
                "purpose": "p", "external": False,
                "supportsFeatures": ["Phantom"]  # cross-field error
            }
        ]
    }
    result = validate(data)
    assert result.is_valid is False
    assert any("lifecycle" in e for e in result.errors)
    assert any("Phantom" in e for e in result.errors)
