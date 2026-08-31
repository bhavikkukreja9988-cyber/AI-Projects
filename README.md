# AI Projects

A collection of personal AI-assisted projects. Each project keeps its source code and historical documentation together.

## Projects

### Premiere Media Ingest
Location: `premiere-media-ingest-v1/`

A Premiere Pro media-ingest project for importing clips from public social/video URLs.

- `backend/` — backend/server code
- `plugin/` — Premiere plugin source
- `docs/` — project documentation, release notes, and version status
- `legacy/` — older version-specific notes preserved for reference

> The application source paths are intentionally left unchanged so build/install workflows are not disturbed.

## Version status

The repository contains documentation for multiple generations of Media Ingest. The latest documented V5.4.5 attempt did **not** resolve the Stack insertion issue; the repository documentation identifies V4.3.2 as the last explicitly user-confirmed working baseline.

See `premiere-media-ingest-v1/docs/VERSION_STATUS.md` for the detailed status and history.

## Repository rules

- Keep active source code separate from historical notes.
- Do not commit secrets, API keys, cloud credentials, or local machine configuration.
- Keep release/version notes in `docs/` or `legacy/`, not mixed into runtime source folders.
