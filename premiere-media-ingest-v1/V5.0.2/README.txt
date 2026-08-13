Media Ingest V5.0.2 — Media Safety Release

Changes from V5.0.1:
1. History Manager Delete now checks Premiere project sequences for clips referencing the selected local media file.
2. If the file is in use, the plugin shows a warning with the number of references and sample sequence/track locations before allowing deletion.
3. If the file is not in use, deletion still requires explicit confirmation.
4. Missing files can be cleaned from the History index without attempting to delete anything from disk.

Inherited V5.0.1 improvements remain included:
- History entries preserve their original selected source ranges.
- Download filenames include source IDs to reduce collisions.
- FFmpeg conversion is transactional.
- Automatic track selection searches independent video/audio combinations.
- Download cancellation cleans up partial files.
- Media metadata reports detected resolution/codecs when FFprobe is available.

Important:
- Deleting a referenced file is still possible only after an explicit confirmation.
- Deleting the Premiere project does not automatically delete Media Ingest files.
- yt-dlp, FFmpeg, and unrelated files are untouched.

Packaging: CEP/ZXP for Premiere Pro 26.x.
