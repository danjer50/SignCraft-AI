# SignCraft AI product contract

Owner directive: 8 October 2026. This is a transformation of the existing repository, not a disconnected replacement. This document preserves the execution contract independently of any Arena session. GitHub history and committed code are the permanent source of truth.

## Non-negotiable release gate

Do not call the product complete or promote a production release with any known critical/major defect, broken primary journey, silent data loss, authentication/security defect, application-caused AI failure, broken mobile flow, fake completed functionality, or unverified production configuration. Severity must not be lowered to pass the gate. Stop, diagnose root cause, fix, test and regression-test discovered major/critical defects. No claim of engineering/structural certification. External AI is not guaranteed free or available. Unimplemented features must be explicitly identified, not disguised behind disabled buttons or simulated results.

Priority: security → data integrity → reliability → zero known major/critical bugs → UX → professional capability → performance → visual polish.

## Preserved baseline

- GitHub main: `6fc0ae6a41ea8f3c5767a8e26d070836e6aa52bc`.
- Preservation revision: `f5e8497769201f3339ca9ee8c4aa807547a1d73c`, two descendant commits with bounded image preparation and correlated diagnostics.
- Work only on `arena/e78a0033-signcraft-ai`. Preserve history, keep tested milestones committed/pushed and keep the repository buildable.
- Keep sound multilingual, materials, auth/authorization, recovery/error boundaries, image/provider abstractions, server-only credentials, echo protections, preparation and diagnostic foundations. Replace inadequate UI/implementations, not these protections.

## Product requirements and acceptance evidence

1. **Identity/home**: premium, futuristic, elegant creative sign atelier; no generic SaaS dashboard, white cards or cheap gaming neon. Transformation-first BEFORE → CONCEPT → AFTER on the same storefront; controlled, accessible interaction. Varied professional signage showcase. Illuminated animated motivational copy in Tunisian Arabic, French and English. Reduced motion. Real showcase imagery must be described as illustrations/examples, never live generation.
2. **Normal/User Mode**: never called Free Mode. Easy business-owner flow: choose/upload → describe business → templates/styles → customize → mounted visualization → variations/review → presentation/quote. Hide technical complexity by default, retain user work on failure. Normal and Pro share a structured project model.
3. **Pro Workspace**: exact units/dimensions, objects/layers, materials, thickness/depth/returns, mounting, lighting, typography, spacing/positioning, technical views, real interactive 3D, production information, exports, client presentations and versions. Flexible navigation, not a mandatory wizard. Server-authorized access/entitlement seam, no fake billing.
4. **Templates**: actual editable components (structure, logo, text/font, colour, layout, materials, dimensions, lighting), not flat-image cards. Business + construction + style metadata. Relevant discovery for compound queries (e.g. luxury black/gold barber, warm-LED projecting café). Strong Normal library; broader Pro library. Identity-preserving deterministic/AI variations with explicit provenance.
5. **Typography**: substantial licensed/open-font library, searchable categories, Arabic/bilingual support, lazy loading. Font, size/weight, tracking/leading, alignment, scale, outline/stroke/shadow/depth/lighting. Curving/warping only if implemented correctly. Fonts/brand assets must not be replaced arbitrarily by AI. User-imported assets require validation and licensing responsibility.
6. **Builder**: channel letters, panels/Alucobond/acrylic/metal/PVC, lightboxes/LED/neon, projecting/hanging, freestanding/monument/totem, window/vehicle applications where implemented. Actual objects with selection, position, scale, rotation, material, colour, depth, text/font, lighting. Non-destructive undo/redo.
7. **AI**: replaceable centrally configured Gemini, OpenRouter, Cloudflare, Pollinations and text-capable Groq. Add/remove/reorder/disable providers without UI rewrites. Server secrets only. Deliberate fallback consent/control, quotas, rate limiting, idempotency and cost protection. Preserve diagnostic IDs/classification/timeouts/application codes; useful recovery: retry/another provider/edit/save. Design editing is deterministic and separate from AI regeneration.
8. **Image lifecycle**: bounded file bytes, header/pixel budget, decode/encode deadlines/cancellation, resource cleanup, accurate errors, operation identity to defeat late/stale uploads. No removed-image restoration, original upload on preparation failure or full-resolution base64 localStorage fallback. Preserve EXIF/aspect ratio and source. Validate output as a real decodable bounded image, not magic bytes alone. Correct before/after geometry and RTL handling.
9. **Provenance**: immutable design/source snapshots with fingerprints, versions and diagnostic/provider provenance. Font/text/style/material/dimension/light/colour/placement/sign/business changes mark old concepts stale. An in-flight result must never silently become current for a changed design. Quoting/presentation must bind the selected version and concept.
10. **Mounted visualization**: preserve storefront, requested placement, scale/perspective and lighting. Clearly distinguish AI visualization from deterministic perspective-composited design, and automatic analysis from manual placement. Do not claim analysis that is not implemented.
11. **Product/3D**: separate mounted and unmounted views; front, perspective/3⁄4, side/back where supported. Real WebGL/Three.js architecture with geometry, extrusion, material/light/shadow, camera rotate/zoom/pan and selection. Never label a 2D graphic interactive 3D. Explicit usable fallback for unsupported/lost graphics contexts.
12. **Dimensions**: mm/cm/m; editable overall/object dimensions, margins/spacing/positions, depth/projection and mounting distance. Visible dimension overlays. Unit conversion is deterministic, finite and bounded; never hardcode one measurement.
13. **Day/night and lighting**: physically plausible front/back/halo/edge/internal/neon/combinations, brightness/colour/direction where supported. Smooth usable day/night transition. Installation rails/brackets/standoffs/fixing points/projection/exploded views where implemented. No structural approval claims.
14. **Readability**: approximate distance previews at 2/5/10/20/50 m and qualified visibility warnings; guidance, not engineering/accessibility certification.
15. **Technical/fabrication**: front/side/top/dimensioned/mounting/layer/material views, component/material/quantity/cutting information only from sufficient real data. Distinguish CONCEPT, DESIGN, TECHNICAL, PRODUCTION and PRESENTATION. Do not fabricate production readiness or unsafe instructions.
16. **Exports**: functional image/presentation/technical PDF, real vector SVG/DXF from paths/geometry, GLB/GLTF where supported. No raster masquerading as manufacturing vectors. Units, included data and limitations explicitly identified; validate export contents, not only download buttons.
17. **Presentation**: professional customer-facing project/concept/specification layout; day/night, mounted/product, 3D/technical views when actually implemented, real PDF when provided.
18. **Projects**: durable extensible model for owner/customer, original/storefront assets, concepts/design snapshots, templates/fonts/materials/dimensions, 3D/mounting/technical/fabrication data, quotes/presentations/exports and history. Pro projects cannot depend solely on localStorage. Real server persistence must be configured and verified before claimed cloud-saved; offline IndexedDB recovery must be explicitly device-local.
19. **Versions/recovery**: named compare/restore/duplicate versions, undo/redo, autosave/reload/recovery and clear saved/saving/failed/device-only/cloud states. Preserve work through AI/network/storage failures. Original assets must survive reload where persistent recovery is available. No silent overwrite on concurrent saves or lost updates.
20. **Auth**: preserve server-side ADMIN/PRO/CUSTOMER authorization. Fix account-state revalidation, role/password changes, logout, session invalidation/revocation. Future recovery/secure account management requires real implementation, no role selector/backdoor. Provider-agnostic Pro entitlements/billing seam; no fake payment (Binance Pay may be future provider).
21. **Quotes**: persist project/version/concept/assets/customer/design/status before confirming sent. Access-controlled admin/pro workflow. Device-local fallback explicitly not sent. Bounded request timeout, input validation, persistence failures and recovery.
22. **Security**: cookies, CSRF/Origin on state changes, shared/serverless-safe throttling, auth/ACL, quotas, file/header/pixel/request limits, server validation, XSS/injection/URLs/SSRF, sensitive log redaction. No keys/passwords/image bodies/private customer data in logs. Do not follow arbitrary provider-returned image URLs.
23. **Performance/mobile**: phone-first intentional UX with usable desktop Pro tools. Android/small-screen/touch uploads, preview, sliders, 3D, forms, templates/fonts and navigation. Lazy font/template/3D loading, memory budgets, responsive controls and reduced-motion accessibility.
24. **Multilingual**: EN/FR/AR, proper RTL design and bilingual Arabic/French signs, Tunisian Arabic motivational copy, extensible message architecture. No mechanical English mirroring of physical canvas coordinates.
25. **Design system**: consistent typography/spacing/controls/panels/toolbars/dialogs/navigation/icons/light/motion/shadow/borders/breakpoints across all routes. Professional visuals a fabricator would show a client. Avoid repetitive templates, generic art, cheap 3D and excessive cards.
26. **Extensions**: subscriptions, client portals, teams, assets/suppliers/material pricing, machine/CNC/print and engineering integrations must have clean interfaces, not simulated completed implementations.

## Required test journeys

- Upload → deterministic edit → generate → edit → stale detection → regenerate → save → reload → continue.
- Invalid/oversized/corrupt image → useful error, original work retained.
- Out-of-order upload/removal, stuck decoding/encoding and original not sent on preparation failure.
- Provider failure/fallback/timeout/body-phase abort/output rejection and useful recovery with diagnostic ID.
- Refresh during editing, save failure, concurrent changes, named restore/compare/duplicate, undo/redo.
- Android-emulated touch/small screens; distinguish emulator results from physical-device testing.
- Arabic RTL, French, English.
- Pro create/edit objects/dimensions/materials → 3D → technical → presentation → real exports.
- Login/session/logout/expired or revoked session/account changes/role authorization/CSRF.
- Server project/asset ACL, optimistic concurrency, persistence/restart, quote confirmation and shared quota/idempotency.

## Execution sequence

A understand → B stabilize → C redesign → D build → E integrate → F test → G harden → H verify → I release. Continue engineering without requiring separate user prompts for each phase. Document robust decisions; ask only for genuinely required external provisioning/access or consequential unresolved product ambiguity. Production release is conditional on the entire QA gate, not deployment success.

## Final evidence required

Build/typecheck/lint/unit+integration/browser/mobile/security/API/upload/auth/storage/export/real-provider checks, critical journeys, production config, no silent data loss, no fake functionality and zero known major/critical bugs. Report what was preserved/repaired/redesigned/implemented, architectural changes, commands/results, browser/device and production checks, limitations/minor issues. Do not print `CRITICAL BUGS REMAINING: 0` or `MAJOR BUGS REMAINING: 0` without evidence satisfying this contract.
