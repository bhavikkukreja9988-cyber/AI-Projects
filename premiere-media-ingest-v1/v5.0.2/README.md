# Media Ingest V5.0.2

Latest feature/stability build for Premiere Pro 26.x using CEP/ZXP.

## Main workflow
- Paste a YouTube, Instagram, or Facebook URL.
- Choose the source range (for example 02:34–03:15).
- Download the full source video locally using the user's installed yt-dlp + FFmpeg.
- Import the full source into Premiere and insert only the selected range.

## V5.0.2 improvements
- History remembers the source ranges used for local downloads and re-insertion.
- Safer source-ID filenames reduce collisions between videos with identical titles.
- FFmpeg conversion is transactional; the original file is retained until the converted output is verified.
- Automatic video/audio track pairing is improved.
- Cancelled downloads clean partial yt-dlp files where possible.
- Downloaded-media metadata can be shown after processing.
- History Manager deletion checks Premiere project references and warns before deleting media that is in use.

## Requirements
- Windows
- Premiere Pro 26.x
- yt-dlp installed locally
- FFmpeg installed locally (ffprobe optional)
- A third-party ZXP installer for CEP extensions

## Media location
The plugin calculates the folder from the active Premiere major/minor version:
`C:\Users\<username>\Documents\Adobe\Premiere Pro\<major.minor>\Media Ingest\Videos`

## Important
V5.0.2 has not yet been confirmed as the new user-validated baseline. Keep V4.3.2 as a fallback until V5.0.2 is tested on the target Premiere installation.

See `PROJECT_HANDOFF_V5.0.2.txt` for the full development context.