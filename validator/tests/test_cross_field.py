from service_catalog_validator.cross_field import check_cross_field
from tests.conftest import load_invalid


def test_valid_example_has_no_cross_field_errors(valid_example):
    assert check_cross_field(valid_example) == []


def test_minimal_example_has_no_cross_field_errors(minimal_example):
    """Minimal example has no features/dependencies; rule is vacuously satisfied."""
    assert check_cross_field(minimal_example) == []


def test_phantom_feature_reference_returns_error():
    data = load_invalid("bad-supports-features-reference.json")
    errors = check_cross_field(data)
    assert len(errors) == 1
    assert "Phantom Feature" in errors[0]
    assert "dependencies" in errors[0]


def test_no_features_and_no_supports_features_is_valid():
    data = {
        "dependencies": [
            {"serviceId": "x", "interaction": "sync-http", "critical": False, "purpose": "p", "external": False}
        ]
    }
    assert check_cross_field(data) == []


def test_supports_features_present_but_features_array_missing_returns_error():
    data = {
        "dependencies": [
            {
                "serviceId": "x", "interaction": "sync-http", "critical": False, "purpose": "p", "external": False,
                "supportsFeatures": ["Some Feature"]
            }
        ]
    }
    errors = check_cross_field(data)
    assert len(errors) == 1
    assert "Some Feature" in errors[0]


def test_multiple_phantom_references_reported_individually():
    data = {
        "features": [{"name": "Real"}],
        "dependencies": [
            {
                "serviceId": "a", "interaction": "sync-http", "critical": False, "purpose": "p", "external": False,
                "supportsFeatures": ["Real", "Ghost1", "Ghost2"]
            }
        ]
    }
    errors = check_cross_field(data)
    assert len(errors) == 2
    assert any("Ghost1" in e for e in errors)
    assert any("Ghost2" in e for e in errors)
