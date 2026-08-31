Media Ingest V4.4.0

Current architecture: CEP/ZXP for Premiere Pro 26.x.

Core confirmed baseline: V4.3.2 successfully downloaded full videos, handled AV1 by converting to H.264 with FFmpeg when necessary, and inserted the requested source range into Premiere.

V4.4 additions:
- Automatic track selection / Auto mode
- Remember last-used settings
- Duplicate URL/download detection

Default media folder:
C:\Users\<WindowsUser>\Documents\Adobe\Premiere Pro\<PremiereMajorMinor>\Media Ingest\Videos

External tools are installed separately by the user:
- yt-dlp.exe
- ffmpeg.exe

The plugin automatically detects common Windows/WinGet locations.

Uninstall must not delete user media, Premiere projects, or separately installed yt-dlp/FFmpeg.

Current user-confirmed working baseline: V4.3.2. V4.4.0 should be treated as a feature build until the user confirms it passes testing.
