# service-catalog-validator

Validates a `service.json` file against the service catalog schema (`../schema/service-catalog.schema.json`), including the cross-field `supportsFeatures` rule that JSON Schema cannot express natively.

## Install (dev)

```bash
cd validator
python3 -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
```

## Usage

```bash
service-catalog-validate path/to/service.json
```

Exit codes:
- `0` — valid
- `1` — validation errors (printed to stderr)
- `2` — usage error: file not found, unreadable, bad encoding, or invalid JSON (see stderr for details)
