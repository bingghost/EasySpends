# Repository Guidelines

## Project Structure & Module Organization

EasySpends is a macOS-first Electron application. `src/App.tsx` coordinates renderer state and navigation; pages and dialogs live in `src/features/`, with shared display formatting in `src/format.ts`. There is no separate asset directory. `electron/main.ts` owns window lifecycle and background tasks, `electron/ipc/` registers finance handlers, and `electron/preload.ts` exposes the approved renderer API. Put persistence in `electron/database/repositories/`, schema changes in `electron/database/migrations.ts`, business rules in `electron/domain/`, and backup or background behavior in `electron/services/`. Design notes live in `docs/`. Test scripts live in `scripts/`; `out/` is generated build output.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies and rebuild Electron's native SQLite module.
- `pnpm dev`: run the desktop app with electron-vite.
- `pnpm exec tsc --noEmit`: type-check without generating files.
- `pnpm build`: produce main, preload, and renderer bundles in `out/`.
- `pnpm test:db`, `pnpm test:accounts`, `pnpm test:ledger`, `pnpm test:analytics`, `pnpm test:automation`, `pnpm test:security`: run focused smoke checks.
- `pnpm dist:mac`: build macOS DMG and ZIP packages on macOS.

## Coding Style & Naming Conventions

Use TypeScript for application code and two-space indentation, matching existing files. Follow the current no-semicolon style. Name React components in `PascalCase`, functions and variables in `camelCase`, and module files in `kebab-case` (for example, `import-service.ts`). Keep SQL in repositories and validate untrusted IPC input in the domain layer. There is currently no configured formatter or linter; run the type-check and build before submitting changes.

## Testing Guidelines

The project uses Node-based smoke scripts (`scripts/*-smoke.cjs`), not a test framework, and has no coverage threshold. Add focused checks for behavior that changes balances, imports, migrations, scheduling, or backup recovery. Run the relevant smoke script plus `pnpm exec tsc --noEmit` and `pnpm build`; run all six smoke scripts for cross-cutting changes.

## Commit & Pull Request Guidelines

This checkout has no Git history, so no existing commit-message convention can be verified. Use short, imperative subjects that name the change. Pull requests should explain user-visible behavior, data migration or security impact, and commands run; include screenshots for renderer changes and link the related issue when one exists.

## Security & Data Handling

Keep database access in the main process. Do not expose Node.js, filesystem access, or raw SQL through the preload API. Treat changes to encryption, key storage, migrations, and restore paths as data-loss-sensitive; verify them with `pnpm test:security` and a recovery scenario.
