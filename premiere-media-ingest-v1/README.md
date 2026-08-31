# Premiere Media Ingest

Premiere Pro media-ingest project for downloading/importing public video sources and placing selected source ranges into Premiere timelines.

## Repository layout

### Active source
- `backend/` — backend/runtime server code
- `plugin/` — Premiere plugin source

These paths are intentionally kept stable so existing build/install workflows are not disrupted.

### Current project documentation
- `docs/VERSION_STATUS.md` — authoritative version/status summary

### Historical documentation
- `legacy/` — archived version-specific READMEs, handoffs, and changelogs

## Architecture notes

The documented Media Ingest releases use a CEP/ZXP architecture for Premiere Pro 26.x. The repository also contains older documentation from earlier architecture discussions; do not treat those historical notes as the active build configuration.

## Safety

Never commit real API keys, cloud credentials, local secrets, or machine-specific configuration.

Uninstall/cleanup behavior must not delete user media, Premiere projects, or separately installed dependencies such as yt-dlp and FFmpeg.
