from typing import Any


def check_cross_field(data: Any) -> list[str]:
    """Enforce the cross-field rule: every value in
    `dependencies[].supportsFeatures` must match a `features[].name`
    declared in the same document.

    Returns a list of human-readable error strings. Empty list means valid.
    Assumes `data` has already passed structural JSON Schema validation;
    is tolerant of missing arrays.
    """
    if not isinstance(data, dict):
        return []

    feature_names: set[str] = set()
    features = data.get("features")
    if isinstance(features, list):
        for f in features:
            if isinstance(f, dict) and isinstance(f.get("name"), str):
                feature_names.add(f["name"])

    errors: list[str] = []
    dependencies = data.get("dependencies")
    if not isinstance(dependencies, list):
        return errors

    for dep_index, dep in enumerate(dependencies):
        if not isinstance(dep, dict):
            continue
        supports = dep.get("supportsFeatures")
        if not isinstance(supports, list):
            continue
        for supports_index, feature_ref in enumerate(supports):
            if not isinstance(feature_ref, str):
                continue
            if feature_ref not in feature_names:
                errors.append(
                    f"dependencies/{dep_index}/supportsFeatures/{supports_index}: "
                    f"references unknown feature {feature_ref!r}; "
                    f"declared features are {sorted(feature_names)}"
                )
    return errors
