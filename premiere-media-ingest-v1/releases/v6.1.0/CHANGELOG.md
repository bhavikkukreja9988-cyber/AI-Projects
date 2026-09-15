# V6.1.0 — Find It

## Added

- New Find It top-level mode alongside Import and History.
- In-panel setup and persisted settings for separate YouTube Data API v3 and Gemini API keys.
- YouTube candidate search with required explicit selection.
- Known-URL flow for directly confirming a public YouTube video.
- Gemini video localization through structured `file_data.file_uri` input, including confidence and evidence display.
- Fresh YouTube duration validation of Gemini results before they can be passed to Import.
- Explicit confirmation before the existing download/import/insert pipeline is used.

## Changed

- CEP manifest and panel version updated to 6.1.0.
- Panel height increased to accommodate the Find It workflow.

## Not changed

- `jsx/index.js` and the existing local yt-dlp, FFmpeg, Premiere import, and timeline insertion pipeline are unchanged.
