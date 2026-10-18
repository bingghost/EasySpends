# AI Development Workflow

This repository includes a project-local Codex task runner and three levels of code search. Run commands from the repository root.

## Task planning and execution

The `codex-task-planner` skill lives at `.agents/skills/codex-task-planner/SKILL.md`. Store plans in `.codex-tasks/plans/`; runtime state, run logs, and the bundled Python runtime are ignored by Git.

```bash
.codex-tasks/run.sh validate
.codex-tasks/run.sh status --json
.codex-tasks/run.sh run --sandboxed
```

Read `.codex-tasks/WORKFLOW.md` before creating a plan. Automatic commits and pushes are disabled in `.codex-tasks/project.json`; review changes and use the repository's normal Git workflow. The wrapper selects the local Python 3.13 runtime and rejects Python versions older than 3.10.

On a fresh checkout, use an existing Python 3.10+ or install a local runtime with `uv python install 3.13 --install-dir .codex-tasks/python --no-bin`.

## Code intelligence

Use the narrowest tool that answers the question:

```bash
# Exact text and filenames
rg -n "showMainWindow" src electron

# Syntax-aware TypeScript/TSX patterns
pnpm exec ast-grep run --lang ts --pattern 'ipcMain.handle($CHANNEL, $$$ARGS)' electron

# Project-aware symbols and navigation
pnpm code:intel symbols Overview
pnpm code:intel definition src/App.tsx 363 12
pnpm code:intel references src/features/overview.tsx 25 49
pnpm code:intel incoming-calls electron/main.ts 230 10
```

Line and column inputs are one-based. Other semantic commands are `outline`, `implementations`, and `outgoing-calls`; run `pnpm code:intel` for syntax. The semantic helper reads `tsconfig.json` on every invocation, so rerunning a command refreshes results and no index cleanup is needed. Search only `src/`, `electron/`, `scripts/`, or a named file; skip `node_modules/`, `out/`, `.codex-tasks/python/`, and generated package artifacts.

If semantic startup fails, run `pnpm install --frozen-lockfile`, then retry. Use `rg` and ast-grep as a fallback for discovery, and confirm definitions or callers by reading the matched files; structural matches are not semantic references.

## Tool choices

`rg` remains the fastest first pass for exact text. The project pins the official [`@ast-grep/cli`](https://ast-grep.github.io/guide/quick-start.html) for repeatable syntax-aware TypeScript searches. The semantic helper uses Microsoft's Language Service API through `@typescript/typescript6`; this stays alongside the app's TypeScript 7 compiler because the [TypeScript 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) directs API consumers to the compatibility package while the native API stabilizes. A separate LSP daemon or SCIP index would add lifecycle and cache maintenance without improving these repository-scale queries. No persistent code index is generated.

## Verification baseline

Run `pnpm exec tsc --noEmit`, `pnpm build`, and the smoke script closest to the changed behavior. Cross-cutting changes require all six `pnpm test:*` scripts listed in `AGENTS.md`.
