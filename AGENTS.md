# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

ETS Agent is a React SPA (Vite + TypeScript) with an Express service for runtime Skill uploads,
server-side Skill calls, and per-conversation sandbox allocation. The legacy evaluation and two
built-in assistants still call DeepSeek from the browser; the Skills Workspace keeps its key on
the server.

### Running the app

- `npm run dev` — starts Vite on `http://localhost:3000` and the proxied Skills API on port 3001.
- `npm run build` — production build to `dist/`.
- `npm run preview` — preview the production build.
- `npm start` — serves `dist/` and `/api` from Express (production/Render).

### Environment variables

Configured in `.env.local` at the project root. Vite injects them at build/dev time:
- `DEEPSEEK_API_KEY` — required for everything: the multimodal evaluation flow and both
  conversational entries (AI 研究助手 / AI 分析助手).
- `DEEPSEEK_VISION_MODEL` — optional; the model used whenever images are sent (evaluation
  screenshots, analysis-assistant attachments).
  Defaults to `deepseek-v4-flash-vision-exp`. `deepseek-v4-flash` does NOT accept image input, so if
  the default name is wrong for an account, change it here rather than in code — the API error
  points at this variable.
- `DEEPSEEK_API_BASE_URL` — optional override, defaults to `https://api.deepseek.com`.
- `DEEPSEEK_MODEL` — Skills Workspace model, defaults to `deepseek-v4-flash`.
- `E2B_API_KEY` — creates one E2B OpenCode sandbox per Skills Workspace conversation.
- `E2B_TEMPLATE` — defaults to E2B's public `opencode` template.
- `E2B_SANDBOX_TIMEOUT_MS` — defaults to 30 minutes and is capped at one hour.
- `DATA_DIR` — uploaded Skills and conversation metadata; defaults to `data/`.
- `APP_ACCESS_TOKEN` — when set, required to log into the site; protects model, conversation,
  artifact, and Skill APIs with an HttpOnly signed cookie.
- `SKILLS_ADMIN_TOKEN` — when set, required as a bearer token for uploading/deleting Skills.

### Research skills (`skills/`)

Two **agent skills** live under `skills/`, following the Anthropic Agent Skills convention
(one folder per skill, `SKILL.md` with `name`/`description`/`role` frontmatter, optional
`references/` and `templates/`). `services/skills/skillRegistry.ts` bundles them at build time via
Vite `import.meta.glob` (raw text); `scripts/` and `evals/` are deliberately **not** bundled.

| Skill | Entry | What it does |
|---|---|---|
| `ux-kit` | AI 研究助手 | Designs research materials (questionnaire / interview guide / usability evaluation plan / research plan) |
| `ux-analysis` | AI 分析助手 | Analyses returned data (survey / interview / analytics / usability / eye-tracking / VoC) into a Word conclusion |

They are upstream/downstream of one another; ux-kit offers a "去做分析" handoff that seeds a fresh
ux-analysis session with the research context.

**Multi-agent shell.** `components/SkillChat.tsx` is generic — message model, composer, history
drawer, skill-trace chip, card rendering. Per-skill behaviour lives in `services/agents/`:

- `types.ts` — `AgentDefinition` plus the shared action vocabulary
  (`ask` / `intent` / `propose` / `request_files` / `generate` / `done`).
- `uxKitAgent.ts` — thin adapter over the existing `services/uxkit/uxkitOrchestrator.ts`.
- `uxAnalysisAgent.ts` — the 6-step flow. **The flow is not hard-coded in TS**: the control turn
  hands the model the SKILL.md body, the conversation, and the current data inventory, and lets it
  decide which node comes next. Change the skill's flow and this file does not move.
- `normalizeAction.ts` — shared fallbacks (retry once on bad JSON; filter empty options *before*
  assigning A–F ids, otherwise a dropped middle option leaves a lettering gap).

Adding a third conversational entry = drop a skill folder in `skills/`, add an `AgentDefinition`,
register it in `services/agents/registry.ts`. The shell needs no changes.

`components/SkillsWorkspacePage.tsx` is a separate runtime-upload experience backed by
`server/index.mjs` and `server/e2bRuntime.mjs`. Uploaded ZIPs are validated and stored under
`DATA_DIR/skills`, then synchronized to `.opencode/skills/<id>` in the conversation's E2B sandbox.
OpenCode loads the selected Skill through its native `skill` tool and runs with DeepSeek V4 Flash.
Following E2B's official integration, the protected sandbox receives the DeepSeek key directly and
its egress allowlist only permits the configured DeepSeek API host.
Generated files are streamed into `DATA_DIR/conversations/<id>/outputs` with per-file/turn limits.

**Context isolation** (an explicit product requirement): each session owns its own `messages`,
`toDeepSeekMessages` only flattens the current session, and starting a new chat swaps the session id
and clears all state — so a new window has no memory. Opening one from history restores messages,
intent and plan, so continuing it keeps full context. `utils/chatHistoryStorage.ts` namespaces
sessions by `agentId`, so the two entries never see each other's history. Image data URLs are
stripped before writing to localStorage (a single session would otherwise blow the quota).

**Attachments** — `utils/attachments.ts` routes by type: text/csv (UTF-8 with a **GB18030 fallback**,
because Chinese survey platforms export GBK and a naive UTF-8 read mojibakes the whole file), xlsx
via `read-excel-file` (all sheets), docx/pdf via the existing `utils/documentTextExtractor.ts`, and
images to data URLs for the vision model. Legacy `.xls` is rejected with a "re-export as .xlsx" note.

**Document generation** is browser-side (no Python). One `Block[]` vocabulary in
`services/docx/blocks.ts` is produced by two parsers and consumed by two renderers:

```
markdown      → services/markdown/parseMarkdown.ts     ─┐         ┌→ services/docx/blocksToDocx.ts  → .docx
                                                        ├→ Block[] ┤
analysis.json → services/analysis/parseAnalysisJson.ts ─┘         └→ components/uxkit/BlockView.tsx → preview
```

`blocksToDocx` takes a `theme`: `uxkit` (10.5pt body, no indent) or `analysis` (11pt, 1.15 line
spacing, 2-character first-line indent, conclusion三段式). Charts are drawn on a canvas by
`services/analysis/chartRenderer.ts` (bar/line/pie/scatter/funnel/radar, ported from
`analysis_builder.py`'s matplotlib specs) and embedded as PNGs. The Python scripts stay in the repo
as the authoritative styling spec.

### Caveats

- **No lint or test scripts**: `package.json` has no `lint` or `test` script. Type-check with
  `npx tsc --noEmit` — it is currently clean and should stay that way.
- **CDN dependencies in index.html**: Tailwind CSS is loaded via a CDN `<script>` tag and **is
  what generates the utility classes at runtime** — if `cdn.tailwindcss.com` is unreachable the app
  renders completely unstyled (`tailwind is not defined`). There is no PostCSS/`tailwind.config.js`
  in the repo. The separate AI Studio `importmap` in `index.html` *is* irrelevant under Vite
  (Vite resolves from `node_modules`), and it is already stale — `js-yaml`, `mammoth`, `pdfjs-dist`
  and `docx` are not in it.
- **Full AI functionality requires an API key**: Without a valid `DEEPSEEK_API_KEY`, the app loads and all UI interactions work, but every AI request fails. Set a real key in `.env.local` to test AI features. Both conversational entries show an explicit banner when it is missing.
- **Much of this can be verified without any API key**: feed `skills/ux-kit/templates/*.md` through
  `parseMarkdown` → `blocksToDocx`, and `analysis_builder.py`'s own `ANALYSIS_EXAMPLE` through
  `parseAnalysisJson` → `blocksToDocx`, then assert on the unzipped `word/document.xml`. Chart
  rendering needs a real browser (canvas); drive it with Playwright against the dev server.
