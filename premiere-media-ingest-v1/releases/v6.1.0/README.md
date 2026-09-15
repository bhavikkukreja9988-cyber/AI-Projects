# Premiere Media Ingest V6.1.0

V6.1.0 adds **Find It**, a third top-level panel mode for finding a moment in a public YouTube video before using the existing download, import, and timeline-insert workflow.

## What changed

- Adds an in-panel **Google API setup** area, available whenever the Premiere panel opens. It stores the YouTube Data API v3 key, Gemini API key, and chosen Gemini model in the existing `mediaIngest.settings.v545` localStorage object.
- Adds an explicit YouTube search-and-confirmation step. Search results are never selected automatically.
- Supports the more reliable “I have a URL” flow when the source video is already known.
- Sends the selected YouTube URL to Gemini as structured `file_data.file_uri` video input—not merely as text in the prompt.
- Requires Gemini to return a range, confidence, and observed evidence. It then performs a fresh YouTube `videos.list` duration check and rejects out-of-bounds results.
- Requires a final user action to copy the verified range into the pre-existing Import controls; it never starts a download or inserts a clip automatically.

## API setup

1. In Premiere, open **Window → Extensions → Media Ingest**, then choose **Find It**.
2. Expand **Google API setup**.
3. Add a YouTube Data API v3 key with that API enabled and restricted to it.
4. Add a separate Gemini API key.
5. Keep the supplied `gemini-3.8-flash` default, or replace it if Google changes the current supported Flash model.
6. Select **Save API Settings**.

The keys are stored only in the CEP panel's localStorage on that computer. They are not encrypted, so use restricted keys and clear them before sharing a user profile or workstation.

## Packaging and installation

`source/` is the complete CEP extension source. The manifest has been bumped to 6.1.0. A signed ZXP is intentionally not included: Adobe ZXP packaging requires the publisher's signing certificate/private key, which is not present in the supplied V6.0.1 release. Package `source/` with the same signing process used for V6.0.1, or install it as an unpacked CEP extension in a development-enabled Premiere environment.
