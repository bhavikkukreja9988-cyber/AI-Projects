# Media Ingest V2

Final requested workflow:

1. Paste a YouTube/Instagram/Facebook URL.
2. Enter source Start/End, e.g. 02:34 to 03:15.
3. The resolver downloads the full source video server-side.
4. Premiere downloads the full MP4 directly to the user's local Media Ingest\Videos folder.
5. Premiere imports the full source file into the current project.
6. Premiere sets project-item source In/Out points to the requested range and inserts only that range at the current playhead or the first empty gap.

The build intentionally targets Premiere 25.6+/26.0 and does not depend on createSubClipAction, which was introduced in Premiere 26.3. See Adobe's ClipProjectItem docs: createSetInPointAction/createSetOutPointAction are available since 25.6, while createSubClipAction is since 26.3.

Client requirements: no yt-dlp, FFmpeg, Python, terminal, or local downloader software. The resolver uses those tools only on the server.
