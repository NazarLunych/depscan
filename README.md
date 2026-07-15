# DepScan — AI Dependency Analyzer

DepScan takes a `package.json` and tells you, per dependency, whether the
upgrade is actually worth doing: is the current version carrying a known
vulnerability, what breaks on the way to latest, and is the ROI of spending
time on it low, middle, or high.

`npm outdated` only shows version numbers. `npm audit` shows vulnerabilities
with no migration context. DepScan combines both with changelog data and lets
Claude turn it into a per-package verdict you can act on.

**[Live demo →](https://depscan-nine.vercel.app)**

<!-- Add a screenshot/GIF of the analysis result here before publishing. -->

## How it works

Analysis is deliberately **not** "paste the whole `package.json` into one
prompt." Each dependency is analyzed in its own isolated cycle:

```
current version (resolved from the semver range)
   │
   ▼
[1] npm Registry          → latest version, repository, deprecation status
[2] npm bulk advisories   → known vulnerabilities (one request per file)
[3] OSV.dev                → additional vulnerabilities, merged with [2]
[4] GitHub Releases        → changelog (primary source)
       └─ too short?  → GitHub Contents (CHANGELOG.md)
              └─ missing? → Exa.ai search (fallback)
                     └─ nothing found? → Claude gets hard facts only
   ▼
Hard facts (JSON) + changelog excerpt → Claude → structured verdict
   ▼
SSE event → Zustand store → package card renders with a highlight
```

Two decisions this hinges on:

- **Hard facts come from APIs, not from the model.** Versions and CVEs are
  fetched from npm / OSV / GitHub and handed to Claude as verified JSON.
  Claude interprets; it never invents a version number or a CVE ID.
- **One package = one isolated pipeline**, run through a concurrency-limited
  pool (`withConcurrency(3)`), streamed to the UI over SSE as each one
  finishes — so a 40-dependency `package.json` doesn't feel like a single
  frozen spinner.

Full write-up of the architecture, data sources, and edge cases lives in
[`docs/PROJECT.md`](docs/PROJECT.md).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 ·
Zustand · Zod · Claude API (`@anthropic-ai/sdk`) · Exa.ai · npm Registry API ·
OSV.dev · GitHub API · Vitest + RTL · Cypress

## Running locally

```bash
git clone https://github.com/NazarLunych/depscan.git
cd depscan
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY and EXA_API_KEY (GITHUB_TOKEN is optional)
npm run dev
```

Open [localhost:3000](http://localhost:3000), paste or drop a `package.json`,
and run the analysis.

### Tests

```bash
npm run test          # Vitest — unit/integration
npm run cypress:run    # Cypress — e2e golden path (needs `npm run dev` running)
```

## License

[MIT](LICENSE)
