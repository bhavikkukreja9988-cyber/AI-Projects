# Media Ingest 1.1.0

Premiere Pro UXP panel that accepts a public YouTube, Instagram, or Facebook URL, requests a selected time range from the cloud resolver, downloads the resulting MP4 directly to the user's PC, imports it into the active Premiere project, and places it at the playhead or the first later continuous empty gap large enough for the clip.

## Local video location

On Windows the default folder is calculated automatically from the current Windows user and Premiere host version:

`C:\Users\<username>\Documents\Adobe\Premiere Pro\<major.minor>\Media Ingest\Videos`

For a Premiere 26.0 installation this is normally:

`C:\Users\<username>\Documents\Adobe\Premiere Pro\26.0\Media Ingest\Videos`

The folder can be changed later if needed.

## Client requirements

- Premiere Pro 25.6+ / 26.x
- No yt-dlp, FFmpeg, Python, or command-line software installed on the user's computer
- Install/uninstall as a UXP `.ccx` through Creative Cloud Desktop

## Cloud backend

The backend runs server-side and may use yt-dlp + FFmpeg there. It returns a short-lived signed download URL. The final MP4 is saved locally on the user's PC and remains there after the project is closed.

## Deployment

1. Deploy `backend/` to a container host.
2. Configure environment variables from `backend/.env.example`.
3. Set `MEDIA_INGEST_API_KEY` to a strong secret.
4. Configure S3/R2-compatible storage credentials and endpoint.
5. Point the plugin's Resolver URL at the deployed backend.

Never commit real API keys or cloud credentials.