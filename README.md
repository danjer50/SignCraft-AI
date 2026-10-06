# SignCraft AI

**SignCraft AI** is a mobile-first sign-design and sign-making foundation for storefronts. Customers can configure a sign from a photo of their own facade, prepare a structured quote request, and hand an approved concept into a professional production workflow.

The project is French-first, with English and Arabic (RTL) interfaces. It is a real, runnable React application; AI image editing and quote delivery deliberately remain **unavailable until a secure provider/storage adapter is configured**. Demo mode does not invent an AI render, claim that a quote was sent, or expose secret keys in the browser.

## What is included

### Customer studio

- JPEG, PNG and WebP storefront upload, validated in the browser and API layer (10 MB maximum).
- Business name and category; exact sign wording; sign type; visual style; colour; lighting; approximate dimensions; notes and special requirements.
- Sign choices: 3D letters, Alucobond, LED, lightbox, acrylic letters, channel letters, vinyl, neon style, illuminated and custom.
- Style choices: modern, luxury, minimal, industrial, bold, elegant, classic, colourful, dark, premium, Arabic, French and Arabic + French.
- Honest concept/result view with original-photo and AI-result panels. The AI panel clearly stays unavailable until a real image-editing provider returns an image.
- A precise, flat HTML typography proof for the customer’s exact wording. It is explicitly **not** presented as a facade render.
- Regenerate and style-change controls prepared for a future provider.
- Quote-request form covering customer contact, business, photo reference, configuration, dimensions, notes, concept state and request status.
- Optional WhatsApp link through `VITE_WHATSAPP_NUMBER`. No placeholder business number is embedded; when unset, the button explains the missing configuration and opens the quote form.

### Professional workspace

`/professional` shows the production path: approved concept → measured dimensions → production design → material calculations → cutting/CNC → quote → manufacture → installation.

The domain model in `src/domain/professional.ts` separates production designs, millimetre dimensions, material requirements, cutting parts/layouts, letter templates, LED placement and production stages. Interfaces for material estimation and DXF/SVG export are present with explicit “not configured” adapters; the app does not invent prices or fabrication files.

### Admin workspace

`/admin` provides a local demonstration inbox and the requested statuses: `NEW`, `CONTACTED`, `QUOTED`, `ACCEPTED`, `COMPLETED` and `CANCELLED`.

In the default foundation, requests are stored only in the current browser’s local storage. The admin view is not authenticated, not shared between devices, and does not receive external requests. Do not use it as a production admin system until authentication and a persistent repository are connected.

## Architecture

```text
src/
  components/          Shared navigation, upload, quote dialog, comparison and typography proof
  context/             Project draft and locale state
  domain/              Sign, quote, professional-production and monetization contracts
  i18n/                French, English and Arabic messages
  pages/               Home, studio, result, professional and admin routes
  services/ai/         Client provider contract, prompt builder and honest demo provider
  services/quotes/     Local quote drafts and server-submission client
  services/production/ Material-estimate and cutting-file interfaces/stubs
  services/billing/    Future monetization interface (no payment processing)
server/
  ai/                  Server-only provider contract and provider factory
  http/                Validating AI and quote API handlers
  quotes/              Quote repository abstraction
api/                   Vercel-compatible serverless entry points
functions/             Cloudflare Pages Functions entry points
```

The customer application calls relative `/api/...` routes, never a browser-side `localhost` service. Vercel and Cloudflare adapters share the same request handlers. In the default demo configuration these endpoints return explicit `503 UNAVAILABLE` responses until a real server-side adapter/repository is installed.

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
| `VITE_AI_MODE` | Browser-safe build flag | `demo` | `demo` never generates an image; `api` submits the original photo to `/api/ai/generate`. |
| `VITE_QUOTE_MODE` | Browser-safe build flag | `local` | `local` saves an explicitly labelled local draft; `api` submits to `/api/quotes` and only reports success after an HTTP 201 confirmation. |
| `VITE_SITE_URL` | Browser build | empty | Adds canonical/Open Graph URLs when configured. |
| `VITE_WHATSAPP_NUMBER` | Browser build | empty | Public contact number in international digits, without `+` or spaces, for `https://wa.me/<number>`. Do not put a private API key here. |
| `SITE_URL` | Build process | empty | When set to an absolute HTTPS URL, generates `dist/sitemap.xml`. |
| `AI_PROVIDER` | **Server only** | `demo` | Provider adapter name. Unknown/unimplemented names stay unavailable. |
| `AI_API_KEY` | **Server only** | empty | Future provider secret. Never prefix it with `VITE_` or expose it to the client. |
| `QUOTE_STORAGE_PROVIDER` | **Server only** | `demo` | Future persistent quote repository adapter. |
| `QUOTE_STORAGE_URL` | **Server only** | empty | Future repository endpoint. |
| `QUOTE_STORAGE_KEY` | **Server only** | empty | Future server-side storage credential. |

`VITE_*` values are public and compiled into the frontend bundle. Keep secrets exclusively in Vercel/Cloudflare server environment settings.

## AI provider integration

The provider-neutral image-editing contract lives in `src/services/ai/contracts.ts`; server implementations belong under `server/ai/` and are selected by `server/ai/providerFactory.ts`.

1. Implement a server-side `ServerAIProvider` adapter. Keep its credentials in server environment variables.
2. Register the adapter in `createAIProvider`.
3. Set `VITE_AI_MODE=api` and the matching server-side `AI_PROVIDER`.
4. Return a generated-image result only when the provider actually returns a real edited image.
5. Keep requests image-to-image/inpainting: use the uploaded storefront as the source, preferably a localized sign-area mask, and preserve the facade, openings, street, camera perspective and scene.

`buildStorefrontEditPrompt()` provides the realism brief (building/environment preservation, plausible sign thickness and mounting, material-specific shadows/reflections, restrained lighting, no extra objects or signage). The prompt also states that generated lettering is not authoritative. The UI’s exact-text proof is separate so a future provider can add a precise SVG/HTML/canvas lettering overlay rather than relying on a diffusion model for spelling.

The current demo provider returns `UNAVAILABLE` and no image URL. This is intentional. Selecting `VITE_AI_MODE=api` does not by itself create an AI integration; until a server adapter is installed, the API responds unavailable and the original photo remains unchanged.

## Quote delivery and demo mode

- Default `VITE_QUOTE_MODE=local`: quote requests are saved in browser local storage for trying the studio/admin workflow. The confirmation explicitly says they were **not sent**.
- `VITE_QUOTE_MODE=api`: the browser posts quote metadata and the original photo (when present) to `/api/quotes`. The server validates the request and file. With the default unconfigured repository it returns `503 QUOTE_DELIVERY_NOT_CONFIGURED`; the browser keeps a local draft and does not claim delivery.
- Implement a persistent, access-controlled `QuoteRepository` in `server/quotes/` before reporting a quote as confirmed. Add authentication, rate limiting, retention policy and upload/object-storage controls before production use.
- The browser stores only a compressed preview for the draft. The original `File` stays in memory; after a reload it must be selected again before an image-edit request can be made.

## Deployment

### Vercel

- Import the repository and use the default Vite build command: `npm run build`.
- The output directory is `dist`.
- `/api/ai/generate` and `/api/quotes` are Vercel Node function entry points under `api/`; a bounded request adapter converts multipart bodies to the shared Fetch handlers. Keep production payload limits in mind and use signed object-storage uploads if the platform limit is lower than the app’s 10 MB photo limit.
- The SPA rewrite is in `vercel.json`.
- Add server secrets in Vercel’s project environment settings, not in client variables.

### Cloudflare Pages

- Build command: `npm run build`.
- Build output: `dist` (`wrangler.toml` is included).
- Pages Functions are under `functions/api/`; `_redirects` provides SPA route fallback.
- Configure the server-only environment variables in the Pages project settings/bindings.

To emit a production sitemap, set `SITE_URL=https://your-domain.example` for the build. The generator writes only public routes (`/`, `/studio`, `/professional`) to `dist/sitemap.xml`. Admin and project-result routes are marked `noindex`.

## Future monetization

`src/domain/monetization.ts` defines entitlements for free concepts, premium concepts, extra revisions, professional packages, rush service, subscriptions and white-label use. `src/services/billing/` is intentionally a no-op until a pricing model and payment provider are selected. No payment processing is implemented.

## Security and privacy notes

- The default studio does not upload photos. Local photo previews and quote drafts stay in the current browser.
- Client and server validate photo MIME types, check the actual JPEG/PNG/WebP magic bytes, and enforce the 10 MB file-size limit; SVG uploads are not accepted.
- AI and quote API entry points are designed to run server-side. No provider keys are bundled into frontend code.
- The admin workspace is demonstration-only and has no authentication or server persistence.
- Add production authentication, authorization, rate limiting, upload scanning/storage, privacy/retention controls and operational logging before using customer data in a live service.

## Tests

The test suite covers prompt realism and exact-text guidance, demo-provider honesty, client/server image validation, upload interaction, quote creation/local fallback, admin status changes, French/English/Arabic switching and RTL direction, and server API “not configured” responses.
