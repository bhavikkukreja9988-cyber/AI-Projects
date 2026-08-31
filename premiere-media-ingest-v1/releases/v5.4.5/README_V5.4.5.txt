Media Ingest V5.4.5

Fix: Safe Stack insertion fallback

When Single Clip is set to Stack at Playhead (Safe) and every eligible track is occupied at the exact playhead position, the plugin now searches forward for the nearest safe empty position instead of failing immediately.

Behavior:
- If a free video/audio track pair exists at the playhead, insert there.
- If the playhead is occupied, search forward for the nearest safe empty position.
- Existing clips are never intentionally overwritten in Stack mode.
- If no eligible space exists anywhere after the playhead, the plugin reports a clear error.

No changes to download, codec conversion, quality selection, batch Project-panel-only behavior, or Project Panel import modes.
