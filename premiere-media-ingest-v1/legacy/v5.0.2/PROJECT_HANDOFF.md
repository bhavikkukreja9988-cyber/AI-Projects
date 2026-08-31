MEDIA INGEST V5.0.2 — PROJECT HANDOFF

Current environment
- Windows
- Premiere Pro 26.2.2
- Architecture: CEP/ZXP
- Local tools: yt-dlp + FFmpeg; ffprobe optional
- Known user-confirmed baseline: V4.3.2
- Current supplied feature build: V5.0.2

Core workflow
Paste YouTube/Instagram/Facebook URL -> choose Start/End -> download the FULL source locally -> import full video -> insert only the selected source range into the Premiere timeline.

Default media folder
C:\Users\<username>\Documents\Adobe\Premiere Pro\<major.minor>\Media Ingest\Videos

V5.0.2 features
1. History & Local Media Manager.
2. Storage/file-size display.
3. One-click re-insertion from existing local media.
4. History remembers clip ranges for correct re-insertion.
5. Local-media deletion safety checks Premiere project references before deleting.
6. Safer source-ID based filenames to reduce title collisions.
7. Transactional FFmpeg conversion; original is retained until converted output is verified.
8. Improved automatic video/audio track pairing.
9. Better cancellation cleanup for yt-dlp partial files/processes.
10. Post-download media metadata/codec reporting when available.
11. V5.0 features retained: metadata/thumbnail preview, social URL cleanup, sequence detection, scale-to-frame, multi-clip batching, Stack/Ripple/Overwrite/Gap modes, Video+Audio/Video-only/Audio-only.

Important safety behavior
- Deleting a Premiere project must not delete Media Ingest media.
- Uninstalling the plugin must not delete user videos, projects, yt-dlp, FFmpeg, or unrelated plugins.
- History Manager deletion now warns if a media file is referenced by the current Premiere project and requires explicit confirmation.

Testing status
V5.0.2 is a feature/stability release and has not yet replaced V4.3.2 as the user-confirmed baseline. Test V5.0.2 in Premiere before declaring it stable.

Recommended V5.0.2 tests
- History range restore and re-insertion.
- Delete an unreferenced media file.
- Attempt to delete a media file referenced by the current project and confirm the warning.
- Download two sources with the same title and confirm filenames do not collide.
- Test H.264/AAC source pass-through.
- Test AV1/VP9/non-AAC conversion and cancellation.
- Test Auto video/audio track pairing with irregular free tracks.
- Test Stack, Gap, Ripple, and Overwrite behavior separately.
- Test batch multi-clip workflow.
