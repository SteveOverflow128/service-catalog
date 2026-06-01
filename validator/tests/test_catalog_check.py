from service_catalog_validator.catalog_check import check_catalog


def _svc(service_id, dependencies=None):
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


def test_empty_catalog_has_no_errors():
    assert check_catalog([]) == []


def test_resolved_internal_dependency_has_no_errors():
    docs = [_svc("a", [_dep("b")]), _svc("b")]
    assert check_catalog(docs) == []


def test_duplicate_service_id_returns_one_error():
    errors = check_catalog([_svc("a"), _svc("a")])
    assert len(errors) == 1
    assert "a" in errors[0]
    assert "duplicate" in errors[0].lower()


def test_dangling_internal_dependency_returns_error():
    errors = check_catalog([_svc("a", [_dep("ghost")])])
    assert len(errors) == 1
    assert "ghost" in errors[0]


def test_external_dependency_to_unknown_is_allowed():
    docs = [_svc("a", [_dep("third-party", external=True)])]
    assert check_catalog(docs) == []


def test_multiple_dangling_dependencies_reported_individually():
    errors = check_catalog([_svc("a", [_dep("ghost1"), _dep("ghost2")])])
    assert len(errors) == 2
    assert any("ghost1" in e for e in errors)
    assert any("ghost2" in e for e in errors)
