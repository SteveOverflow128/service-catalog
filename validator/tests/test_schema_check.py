from service_catalog_validator.schema_check import check_against_schema
from tests.conftest import load_invalid


def test_canonical_example_has_no_schema_errors(schema, valid_example):
    assert check_against_schema(valid_example, schema) == []


def test_minimal_example_has_no_schema_errors(schema, minimal_example):
    assert check_against_schema(minimal_example, schema) == []


def test_missing_required_field_returns_error(schema):
    data = load_invalid("missing-required-field.json")
    errors = check_against_schema(data, schema)
    assert len(errors) == 1
    assert "team" in errors[0]


def test_bad_lifecycle_enum_returns_error(schema):
    data = load_invalid("bad-lifecycle-enum.json")
    errors = check_against_schema(data, schema)
    assert any("lifecycle" in e and "production" in e for e in errors)


def test_bad_tier_value_returns_error(schema):
    data = load_invalid("bad-tier-value.json")
    errors = check_against_schema(data, schema)
    assert any("criticalityTier" in e for e in errors)


def test_bad_retention_format_returns_error(schema):
    data = load_invalid("bad-retention-format.json")
    errors = check_against_schema(data, schema)
    assert any("retention" in e for e in errors)


def test_bad_interaction_enum_returns_error(schema):
    data = load_invalid("bad-interaction-enum.json")
    errors = check_against_schema(data, schema)
    assert any("interaction" in e for e in errors)


def test_additional_top_level_property_returns_error(schema):
    data = load_invalid("additional-top-level-property.json")
    errors = check_against_schema(data, schema)
    assert any("crticalityTier" in e or "additional" in e.lower() for e in errors)


def test_bad_supports_features_passes_schema_check(schema):
    """JSON Schema alone cannot catch this — cross-field check handles it."""
    data = load_invalid("bad-supports-features-reference.json")
    assert check_against_schema(data, schema) == []


def test_bad_dr_strategy_enum_returns_error(schema):
    data = load_invalid("bad-dr-strategy-enum.json")
    errors = check_against_schema(data, schema)
    assert any("drStrategy" in e for e in errors)


def test_bad_top_level_dr_strategy_enum_returns_error(schema):
    """Top-level drStrategy has a different enum from awsServices[].drStrategy."""
    data = load_invalid("bad-top-level-dr-strategy-enum.json")
    errors = check_against_schema(data, schema)
    assert any("drStrategy" in e for e in errors)


def test_bad_data_classification_enum_returns_error(schema):
    data = load_invalid("bad-data-classification-enum.json")
    errors = check_against_schema(data, schema)
    assert any("dataClassification" in e for e in errors)


def test_bad_team_email_returns_error(schema, minimal_example):
    """Format keywords (email, uri) must be enforced by the validator."""
    bad = dict(minimal_example)
    bad["teamEmail"] = "not-an-email"
    errors = check_against_schema(bad, schema)
    assert any("teamEmail" in e or "email" in e.lower() for e in errors), errors


def test_bad_repository_uri_returns_error(schema, minimal_example):
    """uri format must be enforced (parity with the web pipeline's ajv-formats)."""
    bad = dict(minimal_example)
    bad["repository"] = "not a uri"
    errors = check_against_schema(bad, schema)
    assert any("repository" in e or "uri" in e.lower() for e in errors), errors


def test_bad_date_format_returns_error(schema, minimal_example):
    """date format must be enforced for lastUpdatedDate / verificationDate."""
    bad = dict(minimal_example)
    bad["lastUpdatedDate"] = "06-01-2026"  # MM-DD-YYYY, not an ISO date
    errors = check_against_schema(bad, schema)
    assert any("lastUpdatedDate" in e or "date" in e.lower() for e in errors), errors
