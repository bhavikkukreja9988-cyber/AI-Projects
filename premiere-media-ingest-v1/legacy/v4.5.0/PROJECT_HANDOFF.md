MEDIA INGEST — V4.5 HANDOFF

Current Premiere Pro: 26.2.2
Architecture: CEP/ZXP
Known-good user-confirmed baseline: V4.3.2
New feature build supplied by user: V4.5.0

V4.5.0 inspected from the supplied ZXP and source ZIP.

Verified package structure:
- CSXS/manifest.xml
- main/app.js
- main/index.html
- jsx/index.js
- mimetype
- README.txt

V4.5.0 features actually present in the supplied source:
1. Quality selector: Best available, 2160p, 1440p, 1080p.
2. Prefer H.264 checkbox, default ON.
3. Prefer smaller file checkbox, default OFF.
4. Format selection fallback so a constrained request can fall back instead of failing outright.
5. Broader codec conversion: non-H.264 video -> H.264; non-AAC/MP3 audio -> AAC.
6. H.264 + AAC/MP3 sources can pass through without conversion.
7. Download progress now reports percentage, size, speed, and ETA.
8. Cancel button can cancel yt-dlp or FFmpeg.
9. Existing settings are preserved; new V4.5 settings are remembered after first change.
10. Existing V4.4 auto-track, settings persistence, and duplicate-detection logic remains present.

Important observed UI detail:
- The V4.5 UI still labels emptyOnly as "Find empty space after playhead instead (ripple insert)".
- The JSX source comment documents two modes: emptyOnly=true searches a later empty gap; emptyOnly=false attempts playhead-anchored non-destructive stacking on a free track using overwriteClip.
- This should be retained unless testing shows otherwise.

Recommended tests for V4.5.0:
- Test each quality setting and verify actual resulting resolution.
- Test a VP9 source and a non-AAC audio source.
- Test a H.264+Opus source to confirm only audio is re-encoded.
- Start a long download and verify percentage/size/speed/ETA.
- Cancel during yt-dlp download and verify no yt-dlp.exe remains.
- Cancel during FFmpeg conversion and verify no ffmpeg.exe remains.
- Confirm panel returns to Ready after cancellation.

Do not mark V4.5.0 as the new known-good baseline until the user tests these behaviors. V4.3.2 remains the fallback.
