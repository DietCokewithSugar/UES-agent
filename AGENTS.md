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
- `DEEPSEEK_API_KEY` — required for the "AI 体验伙伴" (AI Experience Companion) feature.
- `DEEPSEEK_API_BASE_URL` — optional override, defaults to `https://api.deepseek.com`.

### Research skills (`skills/`)

The "AI 体验伙伴" feature is augmented by pluggable **research skills** under `skills/`,
following the Anthropic Agent Skills convention (one folder per skill with a `SKILL.md` that has
`name`/`description` frontmatter, plus optional `references/`). `services/skills/skillRegistry.ts`
bundles them at build time via Vite `import.meta.glob` (raw text). Skills have a `role` frontmatter
key (default `method`):

- **method skills** (`interview-guide-generator`, `questionnaire-generator`) are injected ONLY in
  `generateExecutionGuide` (执行指南), routed by the selected method's category; the stage-4 prompt
  branches by method type (interview gets lead-in/follow-up question design plus the probing
  guide, survey gets options-only questions and forbids interview concepts). Method-name labels
  (CBA/JTBD/…) guide question organization internally but are never emitted in outputs.
- **process skills** (`problem-clarifier` for stage 2 研究问题, `research-plan-generator` for
  stage 3 研究方案) are injected explicitly via `getSkill(id)` into their stage prompts;
  stage 3 uses a two-phase call (method matching with the skill body, then refinement with only
  the matched reference files).

Stages are strictly isolated: one stage injects exactly one skill, "collaboration" sections in
skill bodies are stripped at injection time, and each prompt forbids borrowing other skills'
terminology.

Add a new method by dropping a folder into `skills/`; no code changes needed. See `skills/README.md`.

### Caveats

- **No lint or test scripts**: `package.json` has no `lint` or `test` script. TypeScript type-checking can be run with `npx tsc --noEmit`, but there is a pre-existing TS error in `App.tsx` (line 354) that does not block the Vite build.
- **CDN dependencies in index.html**: Tailwind CSS is loaded via CDN `<script>` tag, and an `importmap` for AI Studio CDN exists in `index.html` — both are irrelevant in Vite dev mode (Vite resolves from `node_modules`).
- **Full AI functionality requires API keys**: Without a valid `GEMINI_API_KEY`, the app loads and all UI interactions work, but analysis requests will fail. Set real keys in `.env.local` to test AI features.
