from typing import Any


def check_catalog(documents: list[dict]) -> list[str]:
    """Catalog-wide checks that span more than one service document.

    - **duplicate serviceIds** — two documents claiming the same id.
    - **dangling dependencies** — an internal (``external`` != ``True``)
      dependency whose target ``serviceId`` is not present in the catalog.
      ``external: true`` targets are third parties and are expected to be
      unresolved, so they are skipped.

    Returns a list of human-readable error strings. Empty list means valid.
    Assumes each document has already passed per-file schema validation;
    tolerant of missing or oddly-typed fields.
    """
    known: set[str] = set()
    errors: list[str] = []

    for doc in documents:
        if not isinstance(doc, dict):
            continue
        sid = doc.get("serviceId")
        if not isinstance(sid, str):
            continue
        if sid in known:
            errors.append(f"duplicate serviceId {sid!r}")
        else:
            known.add(sid)

    for doc in documents:
        if not isinstance(doc, dict):
            continue
        sid = doc.get("serviceId")
        deps = doc.get("dependencies")
        if not isinstance(deps, list):
            continue
        for index, dep in enumerate(deps):
            if not isinstance(dep, dict):
                continue
            if dep.get("external") is True:
                continue
            target = dep.get("serviceId")
            if not isinstance(target, str):
                continue
            if target not in known:
                errors.append(
                    f"{sid}: dependencies/{index} references unknown service "
                    f"{target!r} (external=false)"
                )

    return errors
