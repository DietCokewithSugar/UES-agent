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
- `DEEPSEEK_API_KEY` — required for the "AI 研究助手" (AI Research Assistant) feature.
- `DEEPSEEK_API_BASE_URL` — optional override, defaults to `https://api.deepseek.com`.

### Research skills (`skills/`)

The "AI 研究助手" feature is a conversational shell over a single **agent skill** under `skills/`,
following the Anthropic Agent Skills convention (one folder per skill with a `SKILL.md` that has
`name`/`description`/`role` frontmatter, plus optional `references/` and `templates/`).
`services/skills/skillRegistry.ts` bundles them at build time via Vite `import.meta.glob` (raw text).
`scripts/` and `evals/` are deliberately **not** bundled.

Currently one skill is installed: **`ux-kit`** (`role: process`). Method routing happens *inside*
the skill (its Phase 0 产物词判定表), not in the frontend — so there is no per-method skill lookup
any more.

The pipeline lives in `services/uxkit/`:

- `uxkitOrchestrator.ts` — two turn kinds.
  - `runControlTurn` — non-streaming + `json_object`. Runs Phase 0 (output-mode detection) and
    Phase 1 (multi-round clarification, capped at 5 rounds). Injects the SKILL.md body plus
    `references/question-templates.md` only. Returns `ask` or `confirm_intent`.
  - `runGenerateTurn` — streaming + plain markdown. Injects the SKILL.md body, the ONE template
    for the mode, and the references picked by `referencePicker.ts`.
  - `derivePlanDeliverables` — after the user confirms a research plan, works out which materials
    each stage needs (per SKILL.md 2D Step D; a VoC stage produces no separate file).
- `normalize.ts` — enforces the hard product rule: **`mode` decides `deliverables`, not the model.**
  If the user named a deliverable, exactly one material is produced and the research-plan step is
  skipped. Pure module (no registry dependency) so it is directly unit-testable.
- `referencePicker.ts` — context budgeting. All 15 references total ~70K chars; injecting them all
  would blow the window. Priority order is template → base refs → hint-matched refs → quality
  checklist, capped at 4 hint refs and 45000 chars. Whatever it actually picks is what the UI's
  skill-trace chip displays.

Document generation is browser-side (no Python): `services/markdown/parseMarkdown.ts` ports Step 1
of `skills/ux-kit/scripts/convert_to_docx.py` into a `Block[]` tree, which feeds BOTH
`services/docx/blocksToDocx.ts` (→ .docx via the `docx` package) and `components/uxkit/BlockView.tsx`
(→ the in-chat preview). One parser, two renderers — so the preview matches the download, and no
markdown dependency was needed. The Python script stays in the repo as the authoritative spec for
the docx styling rules.

UI is `components/UxKitChat.tsx` plus `components/uxkit/`: `ClarifyCard` (multi-select + custom
supplement + skip), `IntentCard` (the intent-confirmation gate), `DocumentCard`, `SkillTrace`,
`BlockView`.

### Caveats

- **No lint or test scripts**: `package.json` has no `lint` or `test` script. Type-check with
  `npx tsc --noEmit` — it is currently clean and should stay that way.
- **CDN dependencies in index.html**: Tailwind CSS is loaded via a CDN `<script>` tag and **is
  what generates the utility classes at runtime** — if `cdn.tailwindcss.com` is unreachable the app
  renders completely unstyled (`tailwind is not defined`). There is no PostCSS/`tailwind.config.js`
  in the repo. The separate AI Studio `importmap` in `index.html` *is* irrelevant under Vite
  (Vite resolves from `node_modules`), and it is already stale — `js-yaml`, `mammoth`, `pdfjs-dist`
  and `docx` are not in it.
- **Full AI functionality requires API keys**: Without a valid `GEMINI_API_KEY`, the app loads and all UI interactions work, but analysis requests will fail. Set real keys in `.env.local` to test AI features. The AI 研究助手 needs `DEEPSEEK_API_KEY` and shows an explicit banner when it is missing.
- **The docx pipeline can be verified without any API key**: feed `skills/ux-kit/templates/*.md`
  through `parseMarkdown` → `blocksToDocx` and check the generated files.
