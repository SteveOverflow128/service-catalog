# Service Catalog

Schema, examples, and validator for the organization's service catalog. Each service repository carries a `service.json` at its repo root; the schema in this repo defines the file structure and the validator enforces it.

## Layout

- `schema/service-catalog.schema.json` — JSON Schema (Draft 2020-12)
- `examples/service.example.json` — canonical full example
- `examples/service.minimal.json` — minimal example (only required fields)
- `examples/invalid/` — invalid fixtures used by validator tests
- `validator/` — Python validator (library + CLI)
- `docs/service-repo-quickstart.md` — adoption guide for service owners

## Quick verification

From the repo root:

```bash
cd validator
python3 -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
pytest -v
```

Expected: all tests pass.

```bash
service-catalog-validate ../examples/service.example.json
service-catalog-validate ../examples/service.minimal.json
```

Both should print `OK` and exit 0.

## For service owners

See [`docs/service-repo-quickstart.md`](docs/service-repo-quickstart.md).
