# DepScan — AI Dependency Analyzer

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What it is
A tool that analyzes a `package.json` and explains whether each dependency is
worth upgrading, what the risks are, and what the ROI of the upgrade is.

How it works: the user attaches a `package.json` (drag&drop or pastes it as text).
For each package independently, **hard facts** are collected (versions,
vulnerabilities, changelog) via official APIs, after which Claude **interprets**
that data and returns a structured verdict: highlight (red / yellow / none),
breaking changes, migration steps, and an ROI estimate (low / middle / high).

Code highlighting:
- **Red** — critical problems in the current version (e.g. security); upgrade is mandatory.
- **Yellow** — upgrade is desirable for useful features, no critical problems.

Upgrade ROI:
- **Low** — not necessary (any change can break something).
- **Middle** — desirable, but not critical right now.
- **High** — definitely worth spending time to figure out and upgrade.

## Project Plan
General plan and roadmap — in [`docs/PROJECT.md`](docs/PROJECT.md).

## Week wrap-up report
After finishing the implementation of a week's scope from the roadmap in
`docs/PROJECT.md`, report on every new function/module written during that week
before considering the week done:

- **If it's already wired up and used somewhere in the current code** — say
  where it's called from and what role it plays in the flow right now.
- **If it's not used yet, but is planned for a future week** — explain what
  it will be used for, which future piece will call it, and what it will do
  once wired in. Don't just say "will be used later" — describe the actual
  future behavior/integration.

This report is separate from code comments (which stay minimal per the
"Code style" rules below) — it's a conversational summary so the current state
of unused-but-planned code is understood before moving to the next week.

## Stack
- **Next.js 16.2** (App Router)
- **React 19**
- **TypeScript 5** (strict mode)
- **Tailwind CSS v4** (via `@tailwindcss/postcss`)
- **Zustand** — client store for analysis results (domain state only — see
  [Client-side view state](#client-side-view-state) for what deliberately stays out of it)
- **Zod** — validation on the API route input and on the Claude output
- **Claude API** (`@anthropic-ai/sdk`) — model `claude-sonnet-4-6` for analysis
- **Exa.ai API** (`exa-js`) — search for changelogs / migration guides (fallback)
- **npm Registry API** — versions + bulk security advisories
- **OSV.dev API** — additional vulnerability data
- **GitHub API** — Releases + Contents (CHANGELOG.md), primary changelog source
- **semver** — resolve versions from range specifiers, filter vulnerabilities
- **@tanstack/react-virtual** — dynamic-height virtualization for the package list
- **Tests**: Vitest + RTL (unit/integration), Cypress (e2e)
- **Deploy**: Vercel

## Commands
```bash
npm run dev            # Dev server (Next.js)
npm run build          # Production build
npm run start          # Production server
npm run lint           # ESLint
npm run test           # Vitest
npm run cypress:run    # Cypress e2e (requires `npm run dev` running separately)
npm run cypress:open   # Cypress e2e, interactive runner
```
> The `test.ts` spike is kept as a reference for the real fact-collection pipeline
> (exact API URLs, advisory filtering, `extractRelevantSections`, Exa call).
> Run it with: `npx tsx test.ts`.

## Project structure
```
src/
  app/
    api/analyze/route.ts        ← SSE endpoint, proxy to the pipeline (runtime: 'nodejs')
    api/analyze/retry/route.ts  ← single-package retry, plain JSON (no SSE — one result)
    layout.tsx                  ← root layout + inline no-flash theme boot script
    page.tsx                    ← thin Suspense wrapper (required for useSearchParams)
  components/
    HomePageContent/       ← actual page body: filter/sort URL sync, all composition
    FileUpload/            ← drag&drop + textarea for package.json
    FilterSortToolbar/     ← highlight filter + ROI/highlight sort controls
    PackageList/           ← virtualized (@tanstack/react-virtual) list of PackageCard
    PackageCard/           ← single-package card with result + highlight + retry button
    ProgressBar/           ← analysis progress (N / total)
    ThemeToggle/           ← light/dark switch, persists to localStorage
    ui/                    ← shared primitives: Button, Checkbox, Card
  hooks/
    useAnalysis.ts         ← SSE client (fetch reader + TextDecoder), store updates
    useRetryPackage.ts     ← single-package retry (plain fetch, reuses store actions)
  stores/
    analysisStore.ts       ← Zustand (packages, order, isRunning, fatalError, summary)
  lib/
    npmRegistry.ts         ← versions, resolveCurrentVersion, bulk advisories, filter
    osvApi.ts              ← OSV.dev requests + normalization
    githubReleases.ts      ← Releases API + Contents (CHANGELOG.md) + parseGitHubRepo
    exaSearch.ts           ← changelog search via Exa (fallback)
    changelogExtractor.ts  ← extractRelevantSections + resolveChangelog (cascade)
    claudeClient.ts        ← Claude call, JSON parse, Zod, retry
    analyzer.ts            ← single-package pipeline (wires everything together)
    batchProcessor.ts      ← withConcurrency(3), one bulk-advisories per file
    packageOrdering.ts     ← pure filter/sort over the store's own order (never mutates it)
    theme.ts               ← getStoredTheme / applyTheme (localStorage + prefers-color-scheme)
    prompts.ts             ← system prompts for Claude
    schemas.ts             ← Zod schemas (single source of truth)
  types/
    index.ts               ← TS types via z.infer<typeof ...>
```

## Key architectural decisions
- **One package = one isolated analysis cycle.** Don't analyze the whole
  `package.json` with a single prompt — tokens won't allow it and part of the data
  will be lost.
- **Hard facts from APIs, not from AI.** Versions and vulnerabilities come from
  npm / OSV / GitHub and are passed to Claude as hard facts. Claude only interprets.
- **Changelog source cascade** — see [Changelog & migration source cascade](#changelog--migration-source-cascade)
  for the authoritative step-by-step order.
- **SSE** for real-time UI updates as each package becomes ready.
- **Batching with concurrency = 3** in parallel (`withConcurrency`, not
  `Promise.all` over everything). Bulk-advisories is called **once** per file
  before the pool.
- **Analysis: current version → latest** (no step-by-step walk through
  intermediate majors).
- **Cache** of results by the `name+version` pair: in-memory (Map) first, Vercel KV
  added later if needed.
- **Retry is a single-package re-run, not a batch re-run.** `POST /api/analyze/retry`
  reuses `analyzePackage` + a one-entry `fetchBulkAdvisories` call as-is — no new
  pipeline code, no `processBatch`/`withConcurrency` involved. It answers with plain
  JSON (`AnalyzerResult`), not SSE, since there's exactly one result to send back.

## Client-side view state

Not everything the UI needs lives in the Zustand store. Three things are
deliberately kept **out** of `analysisStore.ts`:

- **Filter and sort** (`FilterSortToolbar`, `packageOrdering.ts`) — derived,
  computed fresh on every read from the store's own `order` + `packages`,
  exactly like `getSummary()` already does. `order` itself is never mutated or
  reordered; filtering/sorting only ever produce a new derived array.
- **Filter/sort's *persistence*** — lives in the URL (`useSearchParams` /
  `router.replace` in `HomePageContent.tsx`), not in the store and not in
  `localStorage`. This makes a specific filtered/sorted *view* shareable
  within a browser session; it does **not** persist or share the underlying
  analysis results themselves, which still live only in the client's Zustand
  store for that session.
- **Theme** (`ThemeToggle`, `lib/theme.ts`) — `localStorage` + a `.dark` class
  toggled on `<html>`, applied by an inline boot script in `layout.tsx` before
  hydration to avoid a flash. Not app state, so it stays out of Zustand.

Rule of thumb: if it's analysis domain data (packages, their status, results),
it's in the store. If it's how the user is currently *looking* at that data,
it isn't.

## Changelog & migration source cascade
The order of tools for the most reliable, up-to-date info on a package upgrade
(changelog, migration guidance, security flaws). Use the first source that
yields enough signal; fall through otherwise.

```
Step 1: GitHub Releases API
    └─ does the release body contain enough text?
         ✅ Yes (≥ 200 chars, not just a link) → use it
         ❌ No (only a link, or < 200 chars)   → Step 2

Step 2: GitHub Contents API (CHANGELOG.md from the repo)
    └─ does the file exist?
         ✅ Yes → extract the relevant sections → use them
         ❌ No  → Step 3

Step 3: Exa.ai
    └─ search "{package} v{version} migration changelog"
         ✅ Found   → use it
         ❌ Nothing → Claude analyzes hard facts only (source: 'none')
```

Implemented by `resolveChangelog` (`lib/changelogExtractor.ts`), which wires
`githubReleases.ts` → `exaSearch.ts` and runs `extractRelevantSections` over the
chosen source.

## Project organization (feature-based)
Beyond the technical-layer tree above, organize code by **feature** where it
makes sense: co-locate a feature's `components/`, `hooks/`, `services/` (API
calls) and `types.ts`, and expose only its public surface via an `index.ts`
barrel. Reach into a feature through its `index.ts`, never its internals.

- **Feature-local** — components, hooks, services and types used by a single
  feature live inside that feature's folder.
- **Global/shared** — truly reusable UI in `components/ui/`, cross-cutting hooks
  in `hooks/`, app-wide types in `types/`.

> The "Project structure" tree above remains the canonical layout for DepScan;
> the feature-based principle governs how new, self-contained features are added.

## Code style
- All components are **functional**, TypeScript everywhere.
- **Zod** is the source of truth for types: schema first, type via `z.infer`.
- File naming: **PascalCase** for components, **camelCase** for utilities in `lib/`.
- Tests: Vitest + RTL, files `*.test.tsx` / `*.test.ts` next to the code.

## Formatting (Prettier)
Always follow `prettier.config.mjs` exactly when writing or editing any file:
- `semi: false` — no semicolons
- `singleQuote: true` — single quotes (except JSX attributes: `jsxSingleQuote: false`)
- `trailingComma: 'all'` — trailing commas in all positions
- `printWidth: 100`, `tabWidth: 2`, `useTabs: false`
- `arrowParens: 'always'` — `(x) => x`, never `x => x`
- Import order (enforced by `@ianvs/prettier-plugin-sort-imports`):
  1. `react`
  2. `next*`
  3. _(blank line)_ third-party modules
  4. _(blank line)_ `@/components/*`, `@/hooks/*`
  5. _(blank line)_ `@/lib/*`, `@/styles/*`, relative (`./`, `../`)

## Critical rules
- **NEVER** write `any` in TypeScript.
- **NEVER** put logic inside JSX — extract it into hooks/helpers.
- **NEVER** create a component > 150 lines — decompose it.
- **NEVER** merge without passing the TypeScript check.
- **ALWAYS** write a test for a custom hook.
- **ALWAYS** handle loading and error states in data fetching.

## What NOT to do
- Don't use Redux — Zustand only.
- Don't write CSS outside Tailwind (component-level styling; `globals.css`'s
  `@theme`/`@custom-variant` tokens for light/dark are the one sanctioned exception).
- Don't add dependencies without discussion. `@tanstack/react-virtual` was
  discussed and approved specifically for `PackageList`'s dynamic-height
  virtualization — that approval doesn't extend to other libraries.
- Don't do direct DOM manipulation.
- Don't put filter/sort/theme (or other view-only UI state) in
  `analysisStore.ts` — see [Client-side view state](#client-side-view-state).

## Code conventions
- **Zod** validation on the API route input (`package.json`) and on the Claude
  output (JSON).
- Every external `fetch` has a timeout (`AbortSignal.timeout`) and error handling;
  one package's error must not bring down the whole batch (`status: 'error'` for
  that package).

## Environment variables (`.env`)
- `ANTHROPIC_API_KEY` — Claude API.
- `EXA_API_KEY` — Exa.ai.
- `GITHUB_TOKEN` (optional but recommended) — raises the GitHub rate limit from
  60 to 5000 req/h. Without it the cascade degrades to Exa once the limit is hit.

## Path Aliases
`@/*` maps to `src/` (`import '@/lib/analyzer'` → `./src/lib/analyzer`).

## Git commits
Use **Conventional Commits**: `<type>(<scope>): <short description>`

**Types:** `feat` · `fix` · `chore` · `refactor` · `test` · `docs` · `style` · `perf` · `ci`

**Rules:**
- One commit = one logical change (not one file). Every commit must be in a working state.
- Group related config files together (e.g. ESLint + Prettier in one commit — they depend on each other).
- Keep `package.json` + `package-lock.json` together in a separate `chore(deps)` commit so lockfile noise doesn't pollute other diffs.
- Subject line in English, imperative mood, no period at the end.
- Add a body when the *why* is non-obvious.
- Never add any mention of Claude or AI tools in commit messages (no `Co-Authored-By`, no "generated with", no "AI-assisted").

## Current state
The `test.ts` spike is done — it confirmed a working hard-fact collection pipeline
(npm registry → bulk advisories → semver filter → Exa). Next, per roadmap:

- [x] **Week 1** — scaffold Next.js 16.2 over the spike, Zod schemas, types, layout/page skeleton.
- [x] **Week 2** — hard facts: `npmRegistry.ts`, `osvApi.ts` + unit tests (semver, scoped, range).
- [x] **Week 3** — changelog cascade: `githubReleases.ts`, `exaSearch.ts`, `changelogExtractor.ts`.
- [x] **Week 4** — Claude pipeline: `prompts.ts`, `claudeClient.ts`, `analyzer.ts`, `batchProcessor.ts`.
- [x] **Week 5** — SSE: `api/analyze/route.ts`, `analysisStore.ts`, `useAnalysis.ts` + basic UI.
- [x] **Week 6** — resilience: backoff on 429, GitHub cache, cancellation, edge cases, e2e.
- [x] **Week 7** — frontend depth pass: see [`docs/PROJECT.md` §9](docs/PROJECT.md)
      for the full breakdown (retry, virtualized filter/sort, URL state, `ui/`
      primitives, RTL interaction tests, light/dark theme).
