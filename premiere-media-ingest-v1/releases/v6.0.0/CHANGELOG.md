# V6.0.0

UI rebuild (Direction B: Accordion-first) + playhead diagnostics.

Built from the real, working V5.4.6 source. The changelog supplied with this release states that no download/history/codec business logic was touched; the UI structure and settings wiring were changed instead. The V5.4.6 Stack-insertion track-search fix is explicitly marked as untouched.

## Main changes
- Import vs History is now a top-level switch.
- Single Clip vs Batch is a secondary choice inside Import mode.
- Quick Import was removed because its Enter-to-run behavior already existed on the main URL field.
- Quality, Insert Options, and Advanced are collapsed accordions.
- Manual video/audio track selection is hidden behind a switch and auto-opens when a saved non-Auto preference exists.
- Codec preference is consolidated into H.264 / Smaller file / Balanced.
- Tool status is now a compact expandable header indicator.
- The displayed version is driven by a single APP_VERSION constant.
- Success status now reports the actual sequence name and playhead value read by the script to diagnose the remaining playhead issue.

## What was not touched
- Download pipeline, yt-dlp/FFmpeg invocation, format selection, codec conversion, progress parsing, and cancel handling.
- History Manager logic.
- V5.4.6 Stack-insertion track-search fix.
- Duplicate-detection URL normalization, manifest, and batch handling.

## Testing recorded by the supplied changelog
- Syntax checks for `app.js` and `jsx/index.js`.
- DOM ID cross-check: zero missing IDs.
- Full diff against V5.4.6 source.
- History Manager and reinsert call site confirmed unchanged.
- Panel-load simulation and interactive click-through testing.
- Settings load/save testing, including fresh-install behavior.

## Current test request
Test the complete download -> insert workflow and specifically the playhead behavior. If the clip still lands incorrectly, capture the exact `Sequence: ... • Playhead read: ...s` status line.
