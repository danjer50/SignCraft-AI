# Engineering status — release is NOT complete

Date: 2026-10-08. Contract: [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md).

## Baseline reconciliation

The session branch was fast-forwarded from main `6fc0ae6` to GitHub preservation revision `f5e8497`. Both preparation-budget and diagnostic commits remain in history. No other branch was created/switched/pushed. Production has not been promoted.

## Independently executed baseline checks

At `f5e8497`:
- `npm ci`: successful, 0 reported npm vulnerabilities.
- `npm test`: 47 files / 452 tests passed (mock providers, not live generation).
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed. Sitemap deliberately skipped without SITE_URL.

Passing the old suite does not resolve inspected defects. In particular native Node ESM loading is not covered by Vite/Vitest bundler resolution. Upload preview decoding is mocked by existing interaction tests.

## Work underway

Phase B stabilization and runtime-shaped regression coverage, followed by the shared project/design model and new studio/Pro UX. This file will be updated at tested milestones.

## Release blockers

- Known inspected defects are not all repaired yet.
- New product requirements and full cross-layer journeys are not implemented/verified yet.
- No real provider credentials, durable production database or direct Vercel project/log access are available in this environment. Do not interpret absent local settings as proof of absent production settings.
- Outbound sandbox access does not include AI-provider or Vercel hosts; live generation/production runtime checks cannot be claimed here.
- Physical Android testing is not available; browser emulation must be explicitly identified.

No claim of zero remaining major/critical bugs, production readiness, engineering certification or complete product delivery is made.

## Tested engineering milestone 1

- Native per-file ESM reproduction failed before the import repair with ERR_MODULE_NOT_FOUND, then passed after it. `npm run test:native` now loads all 11 API modules and verifies AI/auth method responses without provider calls.
- Initial previews now reuse bounded decoding, enforce byte/header/pixel limits, cancel obsolete work, retain the original File, hash source bytes and never persist a full-resolution base64 fallback. Upload operation identity prevents late replacement/removal races.
- Immutable SHA-256 provenance, stale-result messaging, checked draft-save status, quote timeout/normalization/write verification, physical LTR comparison geometry, stricter Origin checks and reliable client logout confirmation are implemented.
- Account-state/password/role revalidation and a persistent session/SQL repository architecture are added. Production requires a durable session store rather than silently using process-local revocation.
- New shared editable sign/project model, mm/cm/m conversions, metadata-driven templates, 45 OFL-verified vendored fonts, shared shaped-outline geometry, 3D/export modules and transactional IndexedDB/SQL repositories are present. New UX and their end-to-end integration are still underway.
- Independently executed: **52 test files / 469 tests passed**, typecheck, lint, native API smoke. Build validation follows before commit. SQLite quota/concurrency/rollback and IndexedDB binary recovery have dedicated tests. These are not live PostgreSQL/Vercel/provider checks.
- Vercel Git auto-deployment is disabled specifically for this working branch; other branch behavior is unchanged. No production release is authorized by this milestone.

Still open: full output decoder/quality fallback and cost-policy integration, new UX/3D/export browser journeys, production database/provider configuration and real deployment verification. This is not a complete release.
