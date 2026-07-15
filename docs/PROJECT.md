# DepScan — Project Plan

General development plan and feature roadmap. Budget: **4–6 weeks**.

## 1. Problem & goal

Developers look at dozens of dependencies in a `package.json` and don't know:
- Does the current version contain critical vulnerabilities?
- What will change on upgrade (breaking changes)?
- Is the upgrade worth the time spent (ROI)?

`npm outdated` only shows version numbers. `npm audit` only shows vulnerabilities
without migration context. DepScan combines **hard facts** (versions, CVEs,
changelog) with **Claude's interpretation** and produces a clear verdict per
package: highlight, breaking changes, migration steps, and an ROI estimate.

## 2. Why decomposition, not a single prompt

A tool like this can't be built with a single prompt: to analyze all packages,
their current and latest versions against official documentation, and return
everything to the user — tokens won't be enough, and part of the (possibly
critical) information will be lost. Therefore:

1. **Isolated processing** — each package = a separate analysis "branch".
2. **Hard facts from APIs** — versions and vulnerabilities come from npm / OSV /
   GitHub, not "guessed" by AI. Claude receives a JSON of facts and only interprets.
3. **RAG for the changelog** — we don't load all documentation into context; we
   search for a specific "Migration Guide" / "Changelog" and extract only the
   relevant sections (breaking changes, deprecated, security).
4. **Structured output (JSON Mode)** — Claude always returns JSON matching a Zod
   schema, so information isn't lost and maps cleanly into the UI.

## 3. Single-package analysis pipeline

```
range ("^18.2.0")
   │ resolveCurrentVersion (semver.maxSatisfying)
   ▼
[1] npm Registry GET /<pkg>      → current + latest, repository.url, deprecated
[2] npm advisories bulk (once per file) → filter satisfies(current) && gtr(latest)
[3] OSV.dev POST /v1/query       → additional vulnerabilities → merge
[4] GitHub Releases API          → changelog (primary source)
       └ body < 200 chars? → GitHub Contents CHANGELOG.md
              └ missing? → Exa.ai search (contents: { text, highlights }) (fallback)
                     └ missing? → source: 'none'
[5] extractRelevantSections      → keep sections for versions from..to, trim ~8000 chars
   ▼
HardFacts (JSON) + changelog → Claude (JSON Mode, Zod) → PackageAnalysis
   ▼
SSE event "package-done" → Zustand store → PackageCard with highlight
```

Hard facts (example of Claude's output):
```json
{
  "package": "react",
  "current_version": "17.0.2",
  "target_version": "18.2.0",
  "breaking_changes": ["..."],
  "migration_steps": ["..."],
  "security_risks": "critical",
  "roi": "high",
  "highlight": "red"
}
```

## 4. Data sources

| Source | What it provides | Note |
|---|---|---|
| `registry.npmjs.org/<pkg>` | current/latest versions, repo, deprecated | no auth |
| `registry.npmjs.org/-/npm/v1/security/advisories/bulk` | vulnerabilities | one POST per file |
| `api.osv.dev/v1/query` | vulnerabilities (CVE/GHSA) | POST per package+version |
| `api.github.com/repos/{o}/{r}/releases` | changelog / release notes | **60 req/h without token** |
| `api.github.com/repos/{o}/{r}/contents/CHANGELOG.md` | changelog file | fallback |
| Exa.ai `search` (with `contents`) | migration guide from docs sites | last fallback |

### 4.1 Exa.ai SDK: `search` vs `searchAndContents`
The separate `searchAndContents` method is legacy. The current `exa-js` SDK does
search + content retrieval in a single `.search(query, options)` call — pass a
`contents` object to get page content back with the results, instead of calling
a second method:

```ts
const response = await exa.search(query, {
  numResults: 3,
  contents: {
    text: { maxCharacters: 8_000 },
    highlights: true,
  },
})
```

- `contents.text` — full extracted page text (what we feed into
  `extractRelevantSections`).
- `contents.highlights` — short snippets an LLM on Exa's side already judged
  most relevant to the query; `true` uses Exa's default (highest-quality)
  settings, or pass `{ query, maxCharacters }` to steer selection.
- As of Exa's October 2025 update, `search` includes page contents by default;
  omit `contents` to opt out for a faster, results-only search.

## 5. Key risks & mitigations

- **GitHub 60 req/h without a token** — the main bottleneck (~2 requests/package).
  Mitigation: optional `GITHUB_TOKEN` (→ 5000/h), in-memory cache by `owner/repo` +
  ETag, graceful degrade to Exa on 403 / `x-ratelimit-remaining: 0`.
- **Deriving the GitHub repo from npm metadata** — `repository.url` comes in
  various forms (`git+https://`, `git://`, `git+ssh://`, shorthand
  `github:owner/repo`). `parseGitHubRepo` normalizes them; non-GitHub
  (GitLab/Bitbucket) → straight to Exa.
- **Scoped packages `@scope/name`** — correct path encoding for the registry,
  full name as the key in bulk-advisories, the store, and SSE.
- **Resolving a version from a range** — `^`, `~`, `>=`, `*`, `latest`, plus
  unresolvable ones (`workspace:`, `npm:alias@`, git/url). Unresolvable →
  `status: 'error'` with a clear message; don't fail the batch.
- **Package missing from registry / 404 / private** — `status: 'error'`, SSE
  `error` event, the pool continues.
- **Claude / Exa rate limits** — bounded by the `concurrency = 3` pool; retry with
  backoff on 429 / `overloaded`; 1 retry on invalid JSON output from Claude.

## 6. Roadmap (4–6 weeks)

### ✅ Week 1 — Scaffold + types
Install Next 16.2 / React 19 / Tailwind v4 / Zustand / Zod over the spike (keep
`test.ts`). Configure `tsconfig` strict + alias `@/*`, ESLint, Tailwind postcss,
Vitest. Describe all Zod schemas (`lib/schemas.ts`) and types via `z.infer`
(`types/index.ts`). Skeleton `app/layout.tsx`, `app/page.tsx`.

### ✅ Week 2 — Hard facts
`npmRegistry.ts` (fetch packument, `resolveCurrentVersion`, bulk advisories,
`filterRelevantAdvisories`), `osvApi.ts` (+ normalization/merge). Unit tests for
`resolveCurrentVersion`, `filterRelevantAdvisories`, scoped and range edge cases.

### ✅ Week 3 — Changelog cascade
`githubReleases.ts` (Releases + Contents + `parseGitHubRepo` + ETag cache + token),
`exaSearch.ts`, `changelogExtractor.ts` (`extractRelevantSections` from the spike +
`resolveChangelog`). Tests for the cascade and degradation on GitHub 403.

### ✅ Week 4 — Claude pipeline + batch
`prompts.ts`, `claudeClient.ts` (JSON + Zod + retry), `analyzer.ts`
(`analyzePackage` wires everything, catches errors per package), `batchProcessor.ts`
(`withConcurrency(3)`, bulk-advisories once). Integration test on a real
`package.json` (5–10 packages).

### ✅ Week 5 — SSE + client
`app/api/analyze/route.ts` (ReadableStream, events started/package-done/error/done,
heartbeat, AbortSignal), `stores/analysisStore.ts`, `useAnalysis.ts`
(reader + TextDecoder, parse by `\n\n`). Basic UI: FileUpload, PackageCard with
red/yellow/none highlight, ProgressBar (N/total).

### ✅ Week 6 — Resilience & polish
Backoff on 429 (Claude/Exa), GitHub cache, request cancellation, empty/invalid
`package.json`, devDependencies toggle, skeletons/error states in the UI, final
e2e (Cypress), documentation updates.

## 7. Definition of Done (MVP)
- [x] Can paste/upload a `package.json` and run the analysis.
- [x] Cards appear as they become ready (SSE), with progress.
- [x] Each card: highlight, breaking changes, migration steps, ROI, vulnerabilities.
- [x] One package's error doesn't bring down the rest.
- [x] Hard facts (versions/CVEs) come from APIs, not from AI.
- [x] Graceful degrade when the GitHub rate limit is exhausted.
- [ ] Deployed on Vercel.

## 8. Out of scope for MVP (backlog)
- Step-by-step analysis of intermediate majors (17→18→19).
- Persistent cache (Vercel KV / Redis).
- Vector store for very large changelogs (chunking + embeddings).
- Report export (PDF / Markdown), share links.
- Support for `pnpm-lock.yaml` / `yarn.lock`, monorepo workspaces.
- Auto-generating PRs with the upgrades.
