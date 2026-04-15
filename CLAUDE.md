# CLAUDE.md

Guidance for AI assistants (Claude Code and others) working in this repository.

## Project summary

**UES Agent** (a.k.a. "ETS Agent - Experience Analysis") is a client-side
React 19 + TypeScript SPA, built with Vite, that runs an AI-assisted product
UX evaluation workflow. Users upload screens, flows, or videos, describe a
business scenario, pick an evaluation framework + personas, and the app calls
Google Gemini or OpenRouter directly from the browser to produce per-persona
reports, summary reports, A/B comparisons, and optional "optimized design"
image generations.

There is **no backend, database, Docker, or server-side code**. All state is
held in React component state, persisted opportunistically to `localStorage`.

## Tech stack

- React 19 + TypeScript (strict `tsconfig.json`, `jsx: react-jsx`)
- Vite 6 (`vite.config.ts`, dev server on `0.0.0.0:3000`)
- Tailwind CSS via CDN (`<script src="https://cdn.tailwindcss.com">` in
  `index.html`) — there is **no** Tailwind build step or `tailwind.config.js`
  file; the theme extension (colors, shadows, `clay-*` classes) lives in an
  inline `tailwind.config = {...}` block inside `index.html`
- Google Gemini SDK (`@google/genai`) for the Google provider
- `fetch` against `https://openrouter.ai/api/v1/chat/completions` for the
  OpenRouter provider
- Recharts (charts), html-to-image + JSZip + file-saver (PNG / ZIP export)
- mammoth + pdfjs-dist (extract persona info from uploaded docx/pdf/txt)
- lucide-react (icons)

## Repository layout

```
/
├── App.tsx                        # ~2,350 lines. Single root component. Owns ALL app state.
├── index.tsx                      # React entry (mounts <App /> in StrictMode)
├── index.html                     # Tailwind CDN config + clay-* CSS + AI Studio importmap
├── types.ts                       # Shared TS types/enums (Persona, FrameworkReport, …)
├── vite.config.ts                 # Injects GEMINI_API_KEY / OPENROUTER_API_KEY via `define`
├── tsconfig.json                  # `@/*` → project root; allowImportingTsExtensions
├── metadata.json                  # AI Studio manifest
├── package.json                   # Scripts: dev / build / preview (no lint, no test)
├── config/
│   ├── frameworkPresets.ts        # Built-in evaluation frameworks (ETS, HEART, SUS-Lite,
│   │                              #   UEQ-Lite, Design-Quality-Checklist)
│   └── designQualityChecklist.ts  # Checklist items for the 设计质量自查表 framework
├── services/
│   └── geminiService.ts           # ALL LLM calls. Google SDK + OpenRouter fetch.
│                                  #   Exports: analyzeDesign, inferScenarioFromInput,
│                                  #   recommendPersonas, extractPersonasFromText,
│                                  #   compareABReports, generateOptimizedDesign.
├── utils/
│   ├── frameworkSchema.ts         # Validate/parse imported custom-framework JSON
│   ├── personaStorage.ts          # localStorage key: ux-evaluation-personas-v1
│   ├── draftStorage.ts            # localStorage key: ux-evaluation-setup-draft-v1
│   └── documentTextExtractor.ts   # File → text (txt / md / docx via mammoth / pdf via pdfjs)
├── components/
│   ├── LandingPage.tsx            # Default landing screen; "开始评测" enters setup flow
│   ├── ScenarioEditor.tsx         # Step 2: business-scenario form
│   ├── PersonaRecommendations.tsx # AI persona suggestions UI
│   ├── ReportView.tsx             # Single-persona report
│   ├── SummaryReport.tsx          # Multi-persona aggregated report
│   ├── ABReportView.tsx           # A vs B single-persona comparison
│   ├── ABSummaryReport.tsx        # A vs B multi-persona summary
│   ├── RadarChart.tsx             # ETS-style radar (Recharts)
│   ├── charts/FrameworkChart.tsx  # Dispatches on framework.visualization.primaryChart
│   └── report/
│       ├── AiDisclaimer.tsx
│       ├── ChecklistStatusBadge.tsx
│       └── FrameworkSections.tsx  # Renders framework.reportSections dynamic content
├── AGENTS.md                      # Cursor-Cloud-specific notes (keep in sync with this file)
├── README.md                      # User-facing (中文) docs
└── .gitignore
```

## Architecture notes

### State ownership
`App.tsx` is the **single source of truth**. It holds every piece of app state
(page mode, step, uploads, personas, scenario, frameworks, reports, A/B
comparisons, export progress, API config, refs for file inputs and capture
targets, …). Child components are intentionally presentational — when adding
behavior, prefer lifting state into `App.tsx` rather than introducing
per-component state that needs cross-cutting coordination.

Key state/page modes:
- `pageMode: 'landing' | 'setup' | 'report'`
- `activeStep: 1 | 2 | 3 | 4` — setup flow (upload → scenario → framework → personas)
- `uploadConfigMode: 'standard' | 'ab_test'`
- `uploadMode: 'single' | 'flow' | 'video'` (plus A/B variants)
- `apiConfig: { provider: 'google' | 'openrouter', openRouterModel, imageModel }`

### AI service layer (`services/geminiService.ts`)
- `getAIClient()` uses `process.env.API_KEY` (Vite `define`-substituted at
  build time from `GEMINI_API_KEY`).
- Two transport helpers for OpenRouter:
  - `callOpenRouterJson` — messages array + JSON-mode schema hints
  - `callOpenRouterPromptJson` — single prompt string
- `analyzeDesign` returns a `FrameworkReport`; dispatches per provider. It uses
  the per-framework `promptGuidelines`, `dimensions`, and optional
  `checklistItems` when building the prompt.
- `compareABReports` produces `ABComparisonReport` entirely client-side from
  two existing `FrameworkReport`s (no extra AI call) and is the only exported
  function here that is synchronous.
- `generateOptimizedDesign` calls an image model (Google Gemini image preview
  or OpenRouter image models) and returns a base64 image. Disabled in video
  mode.

### Evaluation frameworks
Frameworks are pluggable (`EvaluationFramework` in `types.ts`):
- Built-ins live in `config/frameworkPresets.ts`: `ETS`, `design-quality-checklist`,
  `HEART`, `SUS-Lite`, `UEQ-Lite`.
- Users can import custom frameworks (JSON) at runtime; `utils/frameworkSchema.ts`
  validates them (requires `name`, non-empty `dimensions`, `scoreRange.max > min`,
  `primaryChart ∈ {radar, bar, mixed, cards}`). See `CUSTOM_FRAMEWORK_TEMPLATE`
  for the canonical shape.
- Each framework can declare `reportSections` (dynamic text/list/tags) and
  `checklistItems` (pass/fail design QA). The report UI adapts automatically
  based on `visualization.primaryChart`.

### Persistence
- `ux-evaluation-personas-v1` → persona list (auto-saved via effect in App.tsx).
- `ux-evaluation-setup-draft-v1` → setup wizard draft (manual save; versioned
  with `version: 1`, invalid drafts are discarded).
- No server-side persistence anywhere.

### Type contracts to be aware of
- `FrameworkReport` is the canonical analysis output. The legacy `ETSReport`
  alias still exists — do not introduce new uses; keep `FrameworkReport`.
- `UserRole` is `USER` (usability POV) or `EXPERT` (consistency/audit POV).
- `ProcessStep` carries a base64 `image` plus user-authored `description` —
  used for the "flow" upload mode and passed into prompts verbatim.

## Development workflow

### Scripts (from `package.json`)
```bash
npm install
npm run dev       # vite on http://localhost:3000 (host 0.0.0.0)
npm run build     # production build to dist/
npm run preview   # preview production build
```
There is **no lint script, no test script, and no test framework** configured.
Type-check manually with `npx tsc --noEmit` if needed — but note there is a
known pre-existing TS error around `App.tsx:354` that does not block the
Vite build. Do not try to "fix" unrelated TS errors opportunistically; they
may be load-bearing.

### Environment variables
Create `.env.local` at the repo root:
```
GEMINI_API_KEY=...        # required for Google provider
OPENROUTER_API_KEY=...    # optional; required only if user picks OpenRouter
```
Vite injects these three keys via `define` in `vite.config.ts`:
- `process.env.API_KEY` ← `GEMINI_API_KEY` (legacy alias)
- `process.env.GEMINI_API_KEY`
- `process.env.OPENROUTER_API_KEY`

Without a key, the UI loads fine but AI calls will error. Mention this to the
user if you see `API_KEY` / `OPENROUTER_API_KEY` errors.

### Git workflow
- Default development branch for Claude-driven work:
  `claude/add-claude-documentation-RgFC3` (set in session instructions).
- Always develop on the designated branch, commit with clear messages, and
  push via `git push -u origin <branch>`.
- Never push to `main` directly; never amend published commits.
- Do not open pull requests unless explicitly asked.
- GitHub interactions must use the `mcp__github__*` tools (no `gh` CLI). The
  scope is restricted to `dietcokewithsugar/ues-agent`.

## Conventions & gotchas

### Language
- UI copy, comments, and many identifiers are in **Chinese (Simplified)**.
  Preserve existing Chinese strings verbatim; don't translate user-facing
  copy unless asked.
- Code is English (identifiers, function names, type names).

### Styling
- Tailwind via CDN only. Custom design tokens (`clay`, `soft`, `accent`,
  `clay-card`, `clay-btn`, `clay-input`, etc.) are defined inline in
  `index.html`. If you add new tokens, add them there — do **not** create a
  `tailwind.config.js` (it won't be loaded by the CDN build).
- The visual language is "soft neumorphism" (clay cards + glow shadows).
  Keep new UI consistent with the existing `clay-*` primitives.

### File conventions
- Path alias `@/*` is configured in `tsconfig.json` / `vite.config.ts` but
  most existing code uses relative imports — match surrounding style.
- `allowImportingTsExtensions` is on; some imports may include `.ts`/`.tsx`.
- Do not introduce a new UI library or CSS framework without discussion; the
  app deliberately stays lightweight.

### Editing App.tsx
- `App.tsx` is ~2,350 lines and intentionally monolithic. Before editing,
  grep for the state variable you care about — there are many parallel
  A/B-mode duplicates (e.g. `image` / `abImageA` / `abImageB`,
  `uploadMode` / `abUploadModeA` / `abUploadModeB`). Mirror changes
  consistently across standard + A and B variants.
- File-input interactions flow through `useRef` refs at the top of the
  component (`imageInputRef`, `videoInputRef`, `flowInputRef`, etc.).

### LLM prompts
- Prompts for Google and OpenRouter providers are intentionally kept similar
  but diverge in structure (SDK vs. `messages[]`). When tweaking prompts for
  one provider, check whether the sibling path needs the same change in
  `services/geminiService.ts`.
- Response schemas for the Google SDK live near the top of `geminiService.ts`
  (`REPORT_SCHEMA`, `SCENARIO_SCHEMA`, `PERSONA_RECOMMENDATIONS_SCHEMA`). Keep
  them in sync with `FrameworkReport` / `EvaluationScenario` / `Persona` in
  `types.ts`.

### When adding a new built-in framework
1. Append to `FRAMEWORK_PRESETS` in `config/frameworkPresets.ts` with a
   unique `id`, `modelType`, `dimensions`, `promptGuidelines`, and a
   `visualization.primaryChart`.
2. If the framework uses a checklist, also wire a `checklistItems` array (see
   `DESIGN_QUALITY_CHECKLIST_ITEMS`).
3. `components/charts/FrameworkChart.tsx` already dispatches on
   `primaryChart`; no App.tsx changes should be needed unless the framework
   needs a bespoke UI.

### Exports (PNG / ZIP)
Export uses `html-to-image` on captured refs (`reportCaptureRef`,
`summaryCaptureRef`). If you add new report sections, make sure they render
inside the existing capture roots or exports will silently omit them.

## What *not* to do

- Don't add Tailwind build tooling or a `tailwind.config.js` — the app uses
  the CDN.
- Don't introduce a server, API proxy, or secret storage — all calls are
  browser-direct.
- Don't split `App.tsx` aggressively "for cleanliness" without a concrete
  task asking for it; the monolith is load-bearing for state flow.
- Don't silently rename the `API_KEY` / `GEMINI_API_KEY` / `OPENROUTER_API_KEY`
  env var pattern — it is hard-coded in both `vite.config.ts` and the
  service layer.
- Don't translate existing Chinese UI copy into English.
- Don't commit `.env.local`, `dist/`, or `node_modules/` (already gitignored).

## Related docs

- `README.md` — end-user (Chinese) instructions + custom-framework JSON schema.
- `AGENTS.md` — Cursor-Cloud-specific notes. Keep consistent with this file.
