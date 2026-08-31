Media Ingest V5.0.2 — Media Safety Release

Changes from V5.0.1:
1. History Manager Delete checks available Premiere project sequences for clips referencing the selected local media file.
2. In-use files show a warning with reference count and sample sequence/track locations before deletion.
3. Unreferenced files still require explicit confirmation before deletion.
4. Missing files can be removed from the History index without deleting anything from disk.

Safety notes:
- Explicit confirmation is still required even for referenced files.
- Deleting a Premiere project does not delete Media Ingest files.
- Separately installed yt-dlp and FFmpeg are not changed.
