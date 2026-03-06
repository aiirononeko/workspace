# Repository Guidelines

## Project Structure & Module Organization
This repository is a workspace monorepo with multiple independent apps.

- `scripts/`: root automation for Google Calendar/Sheets and Discord notifications.
- `docs/`, `idea/`, `drafts/`, `knowledge/`: architecture notes, product ideas, and working documents.
- `mvp/discord-bot`: Bun + TypeScript Discord assistant.
- `mvp/bulk-track`: Next.js + TypeScript LINE fitness tracking app.
- `mvp/voice-ink`: Tauri (Rust backend + React frontend) voice input MVP.
- `voice-style-converter/`: standalone Tauri + React app (outside `mvp/`).

Keep changes scoped to the target app directory; treat each package as its own deployable unit.

## Build, Test, and Development Commands
Run commands in the relevant package directory.

- Root: `npm run discord:test` (test-mode notification), `npm run gcal`, `npm run sheets`.
- Discord bot: `cd mvp/discord-bot && bun run dev` (watch mode), `bun run start` (run once).
- Bulk Track: `cd mvp/bulk-track && npm run dev|build|start|lint`.
- Voice Ink: `cd mvp/voice-ink && npm run dev|build`; Rust checks via `cd src-tauri && cargo test`.
- Voice Style Converter: `cd voice-style-converter && npm run dev|build|lint|typecheck`.

## Coding Style & Naming Conventions
- TypeScript/React: 2-space indentation, `camelCase` functions/variables, `PascalCase` components, `kebab-case` shell script names.
- Rust (`src-tauri`): follow `rustfmt` defaults and idiomatic `snake_case` for functions/modules.
- Use existing import patterns (`@/` alias in `mvp/bulk-track`), and keep architecture boundaries enforced by structure-check scripts.
- Linting is enforced with ESLint in `mvp/bulk-track` and `voice-style-converter`.

## Testing Guidelines
- Preferred fast checks are package smoke/structure scripts:
  - `mvp/discord-bot/scripts/smoke-test.sh`
  - `mvp/discord-bot/scripts/structure-check.sh`
  - `mvp/bulk-track/scripts/smoke-test.sh`
  - `mvp/bulk-track/scripts/structure-check.sh`
- Rust unit tests currently exist in `mvp/voice-ink/src-tauri/src/audio.rs`.
- Add tests near the changed module and keep smoke checks green before opening a PR.

## Commit & Pull Request Guidelines
- Follow Conventional Commit prefixes seen in history: `feat:`, `fix:`, `refactor:`, `chore:` (messages are often Japanese).
- Keep commits focused by app/package (avoid mixing root + multiple MVPs in one commit).
- PRs should include: purpose, changed paths, verification commands run, linked issue/task, and screenshots/GIFs for UI changes.

## Security & Configuration Tips
- Never commit secrets or credentials: `.env*`, `.envrc`, and `credentials/` are local-only.
- Use `.env.example` as the template and prefer absolute credential paths as documented in `README.md`.
