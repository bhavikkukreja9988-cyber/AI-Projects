MEDIA INGEST — PROJECT HANDOFF

Current state:
- Premiere Pro: 26.2.2
- Architecture: CEP/ZXP, not UXP/CCX
- Known-good user-confirmed baseline: V4.3.2
- Latest supplied feature build documented at the time: V4.5.0 (not yet fully user-validated)
- Working diagnostic confirmed CEP panel, Node.js, Premiere bridge, yt-dlp detection, FFmpeg detection, and child_process.

Original goal:
Paste YouTube/Instagram/Facebook URL, enter Start/End, download the full source video locally, import full video into Premiere, insert only the requested source range at the playhead or next suitable empty space, and keep linked video/audio together.

Local tools:
- yt-dlp.exe installed separately by user
- ffmpeg.exe installed separately by user
- ffprobe is optional

Default download location:
C:\Users\<WindowsUser>\Documents\Adobe\Premiere Pro\<PremiereMajorMinor>\Media Ingest\Videos

Important behavior:
- Download FULL video, not just the selected range.
- Import full video into Premiere.
- Place only requested source range on timeline.
- Empty-space mode must avoid overwriting existing content.
- Video and linked audio should stay together.
- AV1 downloads must be avoided when possible; if AV1 is returned, FFmpeg should convert to H.264 + AAC MP4 before Premiere import.
- Reuse existing downloaded source when duplicate detection finds it.
- Deleting a Premiere project must NOT delete Media Ingest videos or URL index.
- Uninstalling Media Ingest must NOT delete user videos, projects, yt-dlp, FFmpeg, or unrelated plugins.

V4.4 implemented:
1. Automatic track selection / Auto mode
2. Remember last settings
3. Duplicate URL/download detection via a local Media Ingest index

V4.5.0 supplied build:
1. Quality selector: Best available, 2160p, 1440p, 1080p
2. Prefer H.264 checkbox, default ON
3. Prefer smaller file checkbox, default OFF
4. Graceful format fallback when an exact height/codec combination is unavailable
5. Broader codec handling: non-H.264 video -> H.264; non-AAC/MP3 audio -> AAC
6. H.264 + AAC/MP3 sources pass through without conversion
7. Download progress detail: percentage, size, speed, ETA
8. Cancel button for yt-dlp and FFmpeg
9. Existing preferences preserved; V4.5 controls remembered after change

Development rule:
Keep CEP/ZXP because it was proven on the user's Premiere 26.2.2. Do not switch extension systems without a strong reason and explicit agreement.

Testing history:
- Earlier CCX/UXP packaging attempts failed to install through Creative Cloud.
- CEP diagnostic V4.2.3 successfully loaded.
- V4.3.1 downloaded videos but Premiere rejected AV1 output.
- V4.3.2 fixed AV1 handling; the project notes record the user reporting that everything was working great.
- V4.4.0 introduced auto tracks/settings persistence/duplicate detection.
- V4.5.0 was the supplied feature build; V4.3.2 remained the fallback until V4.5 testing was confirmed.
