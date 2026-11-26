---
date: 2026-11-25
type: docs
scope: docs, agent tooling
files: [AGENTS.md, CLAUDE.md, .claude/settings.json, .claude/skills/add-slash-command/SKILL.md, .claude/skills/add-setting/SKILL.md, .claude/skills/add-db-column/SKILL.md, .claude/skills/document-change/SKILL.md, docs/README.md, docs/architecture.md, docs/configuration.md, docs/development.md, docs/deployment.md, docs/changes/2026-11-25-ai-ready-docs.md, README.md]
breaking: false
---
# Agent-ready documentation and project skills

## Context

- The repository had no `docs/` folder and no instructions for AI coding
  agents. Knowledge lived in `README.md`, `todo.md` and code comments.
- Goal: an agent can find the relevant module, rules and workflow without
  reading the whole codebase.

## Change

- `docs/README.md`: index of topic docs and change records, maintenance rules.
- Topic docs describing the current state:
  - `docs/architecture.md`: module map, interaction, playback, startup and web
    flows, SQLite schema, invariants.
  - `docs/configuration.md`: every environment variable from `process.env`
    reads in `src/`, fixed constants.
  - `docs/development.md`: npm scripts, ESLint config, `node:test` setup,
    conventions.
  - `docs/deployment.md`: `Dockerfile`, `docker-compose.yml`, both CI
    workflows, image tags.
- `AGENTS.md`: tool-agnostic agent instructions (read order, commands,
  definition of done, hard rules, language table, skill list).
- `CLAUDE.md`: imports `AGENTS.md` via `@AGENTS.md`, Claude Code notes.
- `.claude/settings.json`: allows `npm ci`, `npm run lint`, `npm test`,
  `npx eslint`, `node --experimental-sqlite --test`; asks before `git push`,
  `docker compose up|pull`; denies reading `.env` and `data/**`.
- `.claude/skills/`:
  - `add-slash-command`: new file in `src/commands/` with permission guard.
  - `add-setting`: new environment variable.
  - `add-db-column`: column via `ensureColumn()` in `src/db.js`.
  - `document-change`: change record template.
- `README.md`: "Documentation" section pointing to `docs/` and `AGENTS.md`.

## Decisions

- `AGENTS.md` as the canonical file, `CLAUDE.md` only imports it: one source
  for all agents.
- Docs in English, tables over prose: agents grep stable headings.
- No `release` skill: the repository has no release tooling; CI builds images
  from `v*.*.*` tags only.
- No `.dockerignore` change: the file does not exist and the `Dockerfile`
  copies only `package*.json` and `src/`.
- Rejected: moving README content into `docs/`; README stays the human entry
  point.

## Usage / Verification

```bash
python3 -m json.tool .claude/settings.json
ls docs docs/changes .claude/skills
npm ci && npm run lint && npm test
```

## Follow-ups

- Missing standard files: `Makefile` (build/test/tag targets), `CHANGELOG.md`,
  `CONTRIBUTING.md`, `.pre-commit-config.yaml`, `README.de.md`, `LICENSE`
  (`package.json` declares MIT), `.dockerignore`.
- `@noble/ciphers` is a dependency but not imported in `src/`; verify whether
  `@discordjs/voice` needs it before removing.
