# Premiere Media Ingest — Version Status

This file is the single place to understand which version is active, which versions are historical, and which builds were explicitly tested.

## Current repository state

The repository currently contains shared source under `backend/` and `plugin/`. Those paths are intentionally unchanged during this cleanup so the working source layout is preserved.

## Version history

| Version | Status | Notes |
|---|---|---|
| V4.3.2 | Known-good baseline | Last version explicitly documented as user-confirmed working for the core download/import/timeline workflow. |
| V4.4.0 | Historical feature build | Added auto-track, settings persistence, and duplicate URL/download detection; not documented as the new baseline. |
| V4.5.0 | Historical feature build | Added quality/codec/cancellation improvements; documentation says it still required validation. |
| V5.0.2 | Historical feature/stability build | Added History/Local Media Manager and media-safety improvements; documentation says it had not yet replaced V4.3.2 as the validated baseline. |
| V5.4.5 | Latest documented attempt | Attempted to fix Stack insertion, but the documented user test still reported the same insertion error. |

## Important

Do not use version-folder names alone as proof that a build is stable. The explicit test status in documentation is the source of truth.

## Folder organization

### Source
- `backend/` — backend runtime code
- `plugin/` — Premiere plugin runtime code

### Documentation
- `docs/` — current project documentation and status
- `legacy/` — historical release notes and handoffs

## Change policy

When a new version is tested:

1. Keep the source layout stable unless a code change requires otherwise.
2. Add or update a version note under `legacy/`.
3. Update this file with the exact test status.
4. Only mark a version as the known-good baseline after explicit successful testing.
