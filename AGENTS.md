# Repository Guidelines

## Project Goal and Structure

EasySpends is a local-first Electron finance app. `src/App.tsx` coordinates renderer state; pages and dialogs live in `src/features/`. `electron/main.ts` owns window lifecycle, `electron/ipc/` registers handlers, and `electron/preload.ts` exposes the renderer API. Put persistence in `electron/database/repositories/`, migrations in `electron/database/migrations.ts`, rules in `electron/domain/`, and backup behavior in `electron/services/`. Icons are in `resources/`, documentation in `docs/`, utilities in `scripts/`, and generated bundles in `out/`.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies and rebuild Electron's native SQLite module.
- `pnpm dev`: run the desktop app with electron-vite.
- `pnpm exec tsc --noEmit`: type-check without generating files.
- `pnpm build`: produce main, preload, and renderer bundles in `out/`.
- `pnpm test:db`, `pnpm test:accounts`, `pnpm test:ledger`, `pnpm test:analytics`, `pnpm test:automation`, `pnpm test:security`: run focused smoke checks.
- `pnpm dist:mac`: build macOS DMG and ZIP packages on macOS.

## Coding Style & Naming Conventions

Use TypeScript and two-space indentation. Follow the no-semicolon style. Name React components in `PascalCase`, functions and variables in `camelCase`, and modules in `kebab-case` (for example, `import-service.ts`). Keep SQL in repositories and validate untrusted IPC input in the domain layer. No formatter or linter is configured; run type-check and build before submitting.

Do not edit `node_modules/`, `out/`, task-runner state, generated packages, or the local Python runtime. Do not expose Node.js, filesystem access, raw SQL, secrets, or encryption keys through preload. Treat migrations, encryption, key storage, backup, and restore work as data-loss-sensitive.

## Testing Guidelines

The project uses Node smoke scripts (`scripts/*-smoke.cjs`) and has no coverage threshold. Add focused checks for balances, imports, migrations, scheduling, or recovery. Run the relevant smoke script, type-check, and build; run all six scripts for cross-cutting changes.

## AI Workflow and Code Intelligence

Read `docs/ai-development-workflow.md` before using automation. Validate plans with `.codex-tasks/run.sh validate`; run them with `.codex-tasks/run.sh run --sandboxed`. Automatic commit and push are disabled. Use `rg` for text, `pnpm exec ast-grep run` for TypeScript structure, and `pnpm code:intel` for symbols, definitions, references, implementations, and call hierarchy. These commands read live source and need no index refresh.

## Commit & Pull Request Guidelines

Use short, imperative commit subjects. Pull requests should describe user-visible behavior, data or security impact, and commands run; include screenshots for renderer changes and link the issue when one exists. Never commit `.env`, databases, task-runner state, or local runtime files.
