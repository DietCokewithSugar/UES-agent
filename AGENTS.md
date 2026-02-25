# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

ETS Agent is a client-side React SPA (Vite + TypeScript) for AI-powered product experience analysis. It has no backend, no database, and no Docker dependencies. All AI calls go directly from the browser to external APIs (Google Gemini or OpenRouter).

### Running the app

- `npm run dev` — starts Vite dev server on `http://localhost:3000` (host `0.0.0.0`).
- `npm run build` — production build to `dist/`.
- `npm run preview` — preview the production build.

### Environment variables

Configured in `.env.local` at the project root. Vite injects them at build/dev time:
- `GEMINI_API_KEY` — required for Google Gemini AI provider.
- `OPENROUTER_API_KEY` — optional, for OpenRouter AI provider.

### Caveats

- **No lint or test scripts**: `package.json` has no `lint` or `test` script. TypeScript type-checking can be run with `npx tsc --noEmit`, but there is a pre-existing TS error in `App.tsx` (line 354) that does not block the Vite build.
- **CDN dependencies in index.html**: Tailwind CSS is loaded via CDN `<script>` tag, and an `importmap` for AI Studio CDN exists in `index.html` — both are irrelevant in Vite dev mode (Vite resolves from `node_modules`).
- **Full AI functionality requires API keys**: Without a valid `GEMINI_API_KEY`, the app loads and all UI interactions work, but analysis requests will fail. Set real keys in `.env.local` to test AI features.
