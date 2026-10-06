# SignCraft AI

**SignCraft AI** is a mobile-first sign-design and sign-making foundation for storefronts. Customers can configure a sign from a photo of their own facade, prepare a structured quote request, and hand an approved concept into a professional production workflow.

The project is French-first, with English and Arabic (RTL) interfaces. It is a runnable React application. AI image editing is available only when the server-side Cloudflare Workers AI provider and credentials are configured; demo mode remains local and never invents an AI render. Quote delivery still requires a separate persistent repository. The app does not claim a quote was sent or expose secret keys in browser code.

## What is included

### Customer studio

The customer journey is deliberately short and linear — five steps, then a result, then contact:

```text
Photo → Business name → Sign type → Style → Materials → Generate → Result → Quote / WhatsApp
```

- Step 1 · **Photo**: JPEG, PNG and WebP storefront upload, validated in the browser and API layer (10 MB maximum).
- Step 2 · **Business name**: the only required identity field. Exact sign wording and business category are kept one tap away in a collapsed “more details” panel, so nothing was removed from the brief.
- Step 3 · **Sign type**: 3D letters, Alucobond, LED, lightbox, acrylic letters, channel letters, vinyl, neon style, illuminated and custom. Lighting preference lives in the collapsed panel.
- Step 4 · **Style**: modern, luxury, minimal, industrial, bold, elegant, classic, colourful, dark, premium, Arabic, French and Arabic + French, plus the main colour.
- Step 5 · **Materials**: multi-select — one sign may combine up to `MAX_SIGN_MATERIALS` (6) materials in the customer’s priority order: acrylic, aluminium composite, aluminium, expanded PVC, polycarbonate, stainless steel, galvanized steel, wood, adhesive vinyl, LED modules, LED neon flex, plus an explicit “advise me” choice so nobody is blocked by a question they cannot answer yet. Approximate dimensions and notes stay in the collapsed panel. Generation is offered only when a photo file, a business name and at least one material exist.
- **Result**: honest concept view with original-photo and AI-result panels. The result panel stays unavailable on demo, provider error, timeout or unconfirmed response; only a validated image returned by the provider is shown as generated. A precise, flat HTML typography proof shows the customer’s exact wording and is explicitly **not** presented as a facade render. Regenerate and style-change controls are available.
- **Quote / WhatsApp**: the result page ends the flow with a quote request and a WhatsApp action. The quote form covers customer contact, business, photo reference, full configuration (including the ordered material list), dimensions, notes, concept state and request status. The WhatsApp link uses `VITE_WHATSAPP_NUMBER`; no placeholder business number is embedded, and when unset the button explains the missing configuration and opens the quote form.

Flow logic (step order, clamping, per-step validation, how far a customer may jump ahead) lives in `src/domain/customerFlow.ts` and is unit-tested independently from the UI.

### Reliability: no blank screens

Navigation, loading and failure states are explicit everywhere in the customer flow:

- `index.html` paints a branded boot splash inside `#root`, and a `<noscript>` message, so the first frame is never white; `src/main.tsx` also creates a mount node if `#root` is missing.
- `ErrorBoundary` wraps the routed page area (keyed by pathname, so navigating away clears a crash) and the whole app (`variant="root"`). The fallback (`ErrorScreen`) is localized through a non-throwing language accessor and offers retry, home, and “clear the local draft”; it uses plain anchors so it still works if the router is what failed.
- `Suspense` + `PageSkeleton` cover the lazily loaded professional/admin chunks.
- `GenerationProgress` replaces the studio panel while a concept is being generated (panel variant) and shows an inline status on the result page (banner variant), including the honest demo-mode wording.
- `SafeImage` renders a localized placeholder with a retry action when an image (blob URL, data URL, remote) fails to decode, instead of leaving a hole in the layout.
- State recovery: the draft (configuration, materials, photo preview, last concept, current step) is normalized on read through `normalizeSignConfiguration()` / `normalizeConceptResult()` / `clampStep()`, so a legacy, truncated or tampered local draft degrades to safe defaults instead of crashing. A restored preview is never treated as a generatable photo, and the studio says so.
- The AI client aborts a stalled request after `AI_REQUEST_TIMEOUT_MS` (120 s) and reports `AI_TIMEOUT` with an unconfirmed photo transfer; storage failures (private mode, quota) are caught and reported rather than thrown.

### Professional workspace

`/professional` is separate from the customer journey: it is not in the customer header (it lives in the footer “Workspaces” group), it is code-split into its own lazily loaded chunk, and it renders a `WorkspaceNote` that states the separation and links back to the customer flow.

`/professional` shows the production path: approved concept → measured dimensions → production design → material calculations → cutting/CNC → quote → manufacture → installation.

The domain model in `src/domain/professional.ts` separates production designs, millimetre dimensions, material requirements, cutting parts/layouts, letter templates, LED placement and production stages. Interfaces for material estimation and DXF/SVG export are present with explicit “not configured” adapters; the app does not invent prices or fabrication files.

### Admin workspace

`/admin` is kept out of the customer flow the same way (footer access, separate chunk, `WorkspaceNote`). It shows the ordered material list of each request and reports when browser storage is unavailable instead of displaying a silently empty inbox.

`/admin` provides a local demonstration inbox and the requested statuses: `NEW`, `CONTACTED`, `QUOTED`, `ACCEPTED`, `COMPLETED` and `CANCELLED`.

In the default foundation, requests are stored only in the current browser’s local storage. The admin view is not authenticated, not shared between devices, and does not receive external requests. Do not use it as a production admin system until authentication and a persistent repository are connected.

## Architecture

```text
src/
  components/          Navigation, upload, material picker, optional-details disclosure, quote dialog,
                       comparison, typography proof, error boundary/screen, skeleton, safe image
  context/             Project draft (with step + material state) and locale state
  domain/              Sign and material contracts, customer-flow steps/validation,
                       professional-production and monetization contracts
  i18n/                French, English and Arabic messages
  pages/               Home, studio, result, professional and admin routes
  services/ai/         Client contract, local image preparation, prompt builder and demo provider
  services/quotes/     Local quote drafts and server-submission client
  services/production/ Material-estimate and cutting-file interfaces/stubs
  services/billing/    Future monetization interface (no payment processing)
  services/draftStorage.ts  Safe local-storage read/write/clear for the customer draft
server/
  ai/                  Server-only provider contract, provider factory and Cloudflare FLUX.2 adapter
  http/                Validating AI and quote API handlers
  quotes/              Quote repository abstraction
api/                   Vercel-compatible serverless entry points
functions/             Cloudflare Pages Functions entry points
```

The customer application calls relative `/api/...` routes, never a browser-side `localhost` service. Vercel and Cloudflare adapters share the same request handlers. `/api/ai/generate-sign` (also `/api/ai/generate` for compatibility) validates and prepares the request, then delegates to the server-selected provider. The default `AI_PROVIDER=demo` returns an explicit unavailable result; Cloudflare FLUX runs only with server-side credentials. Quote API delivery remains separate and unconfigured by default.

## Local setup

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Vite prints the local development URL. The interface works with the default zero-cost demo settings and no API credentials.

Quality checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Environment variables

Copy `.env.example` and configure only what you need:

| Variable | Where it is used | Default | Purpose |
| --- | --- | --- | --- |
| `VITE_AI_MODE` | Browser-safe build flag | `demo` | `demo` never generates an image; `api` locally resizes/compresses a copy to a JPEG under 512 × 512, then submits it to `/api/ai/generate-sign`. The original file stays in the browser. |
| `VITE_QUOTE_MODE` | Browser-safe build flag | `local` | `local` saves an explicitly labelled local draft; `api` submits to `/api/quotes` and only reports success after an HTTP 201 confirmation. |
| `VITE_SITE_URL` | Browser build | empty | Adds canonical/Open Graph URLs when configured. |
| `VITE_WHATSAPP_NUMBER` | Browser build | empty | Public contact number in international digits, without `+` or spaces, for `https://wa.me/<number>`. Do not put a private API key here. |
| `SITE_URL` | Build process | empty | When set to an absolute HTTPS URL, generates `dist/sitemap.xml`. |
| `AI_PROVIDER` | **Server only** | `demo` | Set to `cloudflare-flux` to use `@cf/black-forest-labs/flux-2-klein-9b`; `demo` remains unavailable and unknown names never fabricate an image. |
| `CLOUDFLARE_ACCOUNT_ID` | **Server only** | empty | Your Cloudflare account ID (32 hexadecimal characters), required for the Workers AI REST endpoint. |
| `CLOUDFLARE_API_TOKEN` | **Server secret** | empty | Workers AI API token. Never prefix it with `VITE_`, commit it, or expose it to the client. |
| `AI_API_KEY` | **Server only** | empty | Reserved for other future provider adapters. Never prefix it with `VITE_` or expose it to the client. |
| `QUOTE_STORAGE_PROVIDER` | **Server only** | `demo` | Future persistent quote repository adapter. |
| `QUOTE_STORAGE_URL` | **Server only** | empty | Future repository endpoint. |
| `QUOTE_STORAGE_KEY` | **Server only** | empty | Future server-side storage credential. |

`VITE_*` values are public and compiled into the frontend bundle. Keep secrets exclusively in Vercel/Cloudflare server environment settings.

## Cloudflare Workers AI provider

The client-side contract lives in `src/services/ai/contracts.ts`. Server providers implement `ServerAIProvider` in `server/ai/` and are selected by `server/ai/providerFactory.ts`. The first real adapter is `server/ai/providers/cloudflareFlux.ts`, configured with the fixed model `@cf/black-forest-labs/flux-2-klein-9b`.

### Configure the provider

1. Set the public build flag `VITE_AI_MODE=api`.
2. Set the server-side `AI_PROVIDER=cloudflare-flux`.
3. In the Vercel project environment or Cloudflare Pages bindings/secrets, set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. The account ID must be 32 hexadecimal characters. Create a Workers AI API token; a custom token needs Workers AI Read and Workers AI Edit permissions. Do not put the token in any `VITE_*` variable or frontend code.
4. Redeploy so the frontend mode and server environment are both active. For local secrets, `.env` is git-ignored; `npm run dev` is the demo frontend, while actual server routes run through the Vercel/Cloudflare adapters.

The browser posts to `/api/ai/generate-sign` (the existing `/api/ai/generate` alias remains available). It first uses `createImageBitmap` and canvas to make a temporary compressed JPEG copy no larger than 511 × 511 pixels. The original `File` remains unchanged in the browser. The server independently validates request size, MIME type, JPEG/PNG/WebP signature, image dimensions, configuration enums, the ordered `materials` list (an array of known identifiers, at most six entries; a malformed list is rejected with `400 INVALID_CONFIGURATION`), business name, exact text, dimensions and notes before contacting the provider. `/api/quotes` validates the same list and returns `400 INVALID_QUOTE` when it is malformed.

The adapter calls Cloudflare's fixed Workers AI REST host with multipart `prompt`, output `width`/`height`, and the binary storefront reference under the required field name `input_image_0`. It does not accept user-supplied URLs, so it cannot be used for arbitrary URL fetching/SSRF. Cloudflare returns a base64 `result.image`; the adapter validates and decodes its image signature before the SignCraft API returns a `data:image/...` result. Tokens and provider error payloads are never logged or returned to the browser.

`buildStorefrontEditPrompt()` (prompt version `storefront-inpaint-v3`) requests a localized change to the intended sign area and preservation of the original building, openings, street and camera perspective; it also specifies fabrication thickness, mounting, materials, color and physically plausible lighting. The selected materials are listed in the customer’s priority order and the prompt asks the model to combine several materials plausibly on one sign instead of duplicating it; when no material was chosen (or only “advise me”), it asks for one plausible material without inventing branded products. Business name, exact wording, sign type, style, materials, color, lighting, dimensions and notes remain structured `SignConfiguration` data. The prompt asks FLUX lettering to be only an approximation: the app's separate HTML typography proof remains authoritative for spelling. The model can still alter scene details or text, so review the output before quoting or manufacturing; this integration is not a fabrication approval.

Demo mode remains the zero-cost default and never calls an image service. If configuration is missing, Cloudflare rejects or limits a request, credits are unavailable, a timeout occurs, or the response is invalid, the app shows a localized retryable error and no generated image. It separately reports local-only, submitted, successfully processed and unconfirmed photo states. A failed network response is conservatively treated as unconfirmed because the server/provider may have received the image even if the browser did not receive a response.

Cloudflare references: [FLUX.2 Klein 9B model schema](https://developers.cloudflare.com/workers-ai/models/flux-2-klein-9b/), [Workers AI REST setup and token permissions](https://developers.cloudflare.com/workers-ai/get-started/rest-api/), and [FLUX.2 Klein multipart/API specifics](https://developers.cloudflare.com/changelog/post/2026-01-28-flux-2-klein-9b-workers-ai/).

**Live Cloudflare generation requires real account credentials.** Automated tests mock the Workers AI response; they do not prove account permissions, credit availability, model behavior or production latency.

## Quote delivery and demo mode

- Default `VITE_QUOTE_MODE=local`: quote requests are saved in browser local storage for trying the studio/admin workflow. The confirmation explicitly says they were **not sent**.
- `VITE_QUOTE_MODE=api`: the browser posts quote metadata and the original photo (when present) to `/api/quotes`. The server validates the request and file. With the default unconfigured repository it returns `503 QUOTE_DELIVERY_NOT_CONFIGURED`; the browser keeps a local draft and does not claim delivery.
- Implement a persistent, access-controlled `QuoteRepository` in `server/quotes/` before reporting a quote as confirmed. Add authentication, rate limiting, retention policy and upload/object-storage controls before production use.
- The browser stores only a compressed preview for the draft. The original `File` stays in memory; after a reload it must be selected again before an image-edit request can be made.

## Deployment

### Vercel

- Import the repository and use the default Vite build command: `npm run build`.
- The output directory is `dist`.
- `/api/ai/generate-sign` (and the backwards-compatible `/api/ai/generate`) plus `/api/quotes` are Vercel Node function entry points under `api/`; a bounded request adapter converts multipart bodies to the shared Fetch handlers. The AI client uploads only its resized/compressed copy. Keep platform payload limits in mind and use signed object-storage uploads if quote uploads approach platform limits.
- The SPA rewrite is in `vercel.json`.
- Add server secrets in Vercel’s project environment settings, not in client variables.

### Cloudflare Pages

- Build command: `npm run build`.
- Build output: `dist` (`wrangler.toml` is included).
- Pages Functions are under `functions/api/`; both `/api/ai/generate-sign` and the legacy `/api/ai/generate` call the shared provider handler. `_redirects` provides SPA route fallback.
- Configure the server-only environment variables in the Pages project settings/bindings.

To emit a production sitemap, set `SITE_URL=https://your-domain.example` for the build. The generator writes only public routes (`/`, `/studio`, `/professional`) to `dist/sitemap.xml`. Admin and project-result routes are marked `noindex`.

## Future monetization

`src/domain/monetization.ts` defines entitlements for free concepts, premium concepts, extra revisions, professional packages, rush service, subscriptions and white-label use. `src/services/billing/` is intentionally a no-op until a pricing model and payment provider are selected. No payment processing is implemented.

## Security and privacy notes

- In default demo/local mode, photos remain in the current browser. In AI API mode, only a resized/compressed JPEG copy (max 511 pixels per side) is submitted to SignCraft and may be forwarded to Cloudflare; the original remains unchanged in browser memory. Quote API mode may send the selected original file. The UI reports successful, failed and unconfirmed transfers separately.
- Client and server validate photo MIME types and magic bytes, enforce the 10 MB original-file limit, and the AI route validates decoded header dimensions before forwarding; SVG uploads are not accepted.
- AI and quote API entry points are designed to run server-side. No provider keys are bundled into frontend code.
- The admin workspace is demonstration-only and has no authentication or server persistence.
- Add production authentication, authorization, rate limiting, upload scanning/storage, privacy/retention controls and operational logging before using customer data in a live service.

## Tests

The test suite covers prompt realism and exact-text data, multi-material prompt building, browser-side image resizing, demo-provider honesty, AI client failure mapping (timeout, dropped connection, unsafe or unconfirmed response), Cloudflare multipart payload/response parsing with mocked fetch, missing configuration, invalid/oversized images, provider errors, timeouts and network failure, upload interaction, quote creation/local fallback, admin status changes, French/English/Arabic switching and RTL direction.

It also covers the UX guarantees added to the customer flow: the five-step order and per-step validation rules, multi-material selection with the six-material cap and priority order, draft recovery from corrupted, legacy or tampered local storage, error-boundary rendering/retry/root fallback, and routing resilience — every route (home, studio steps, result, professional, admin, unknown) must render visible content instead of a blank screen. Mocked Cloudflare tests are not a live account test.

Before deploying, run all four checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
