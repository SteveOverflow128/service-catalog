# Adding `service.json` to a Service Repository

This guide walks a service owner through adopting the service catalog in their repository.

## 1. Drop a `service.json` at the repo root

Copy `examples/service.minimal.json` from the catalog repo to your repo's root as `service.json` and fill in the eight required fields:

- `serviceId` — kebab-case, unique across the org (e.g., `task-service`)
- `name` — human-readable display name
- `team` — owning team's name
- `teamEmail` — distribution list or shared inbox
- `lifecycle` — one of `experimental`, `non-prod`, `prod`, `sunset`
- `criticalityTier` — `0` (mission-critical; an outage halts the business) through `3` (internal only, non-critical), or `?` if not yet scored
- `repository` — repo URL
- `dataClassification` — one of `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED` (the most sensitive data the service handles)

Then add optional sections (`awsServices`, `datastores`, `features`, `dependencies`, `tags`, etc.) as they apply. See `examples/service.example.json` for a full reference.

## 2. Validate locally

From the catalog repo (cloned alongside your service repo):

```bash
cd /path/to/service-catalog/validator
. .venv/bin/activate
service-catalog-validate /path/to/your-service-repo/service.json
```

Exit `0` means the file is valid. Exit `1` lists validation errors to stderr.

## 3. Add a CI check (recommended)

Example GitHub Actions / Gitea Actions step:

```yaml
- name: Validate service.json
  run: |
    pip install --quiet "git+https://git.example.com/platform/service-catalog.git#subdirectory=validator"
    service-catalog-validate service.json
```

This fails the build if `service.json` is invalid.

## 4. Tier-0 / tier-1 reminders

The schema does not require `awsServices`, `datastores`, or `dependencies` arrays, but the catalog app will surface gaps for tier-0 and tier-1 services. Treat those sections as effectively required if your service is `criticalityTier: 0` or `1`.

## See also

- [JSON Schema document](../schema/service-catalog.schema.json) — machine-readable spec
- [Validator README](../validator/README.md) — CLI usage and install
