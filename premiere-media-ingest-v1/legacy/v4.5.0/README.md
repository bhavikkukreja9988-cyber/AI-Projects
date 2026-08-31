Media Ingest V4.5.0

Changes from V4.4.3 (V4.5 roadmap)
1. Quality selector: Best available, 2160p, 1440p, 1080p; Prefer H.264; Prefer smaller file.
2. Broader codec handling: non-H.264 video -> H.264; non-AAC/MP3 audio -> AAC; H.264 + AAC/MP3 passes through.
3. Detailed download progress: percentage, downloaded size, speed, ETA.
4. Cancel button cancels yt-dlp or FFmpeg and cleans up.
5. Existing preferences are preserved; new quality controls default to Best/On/Off until changed.

Testing requested by the V4.5 source README:
- Verify actual resolution for each quality setting.
- Test VP9/non-AAC sources and confirm conversion.
- Start a download, verify percentage/size/speed/ETA, cancel, and confirm no lingering yt-dlp.exe/ffmpeg.exe processes.

Install with the same third-party ZXP installer used for the working CEP build.

Important: V4.3.2 remains the last user-confirmed baseline. V4.5.0 is a feature build and should be user-tested before replacing the known-good fallback.
