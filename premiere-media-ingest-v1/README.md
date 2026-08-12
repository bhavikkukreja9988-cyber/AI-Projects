# Media Ingest V1.0

Premiere Pro UXP panel + cloud resolver for importing selected sections of public YouTube, Instagram, or Facebook videos.

## Client
- Premiere Pro 25.6+ / 26.x
- No yt-dlp, FFmpeg, Python, or command-line software on the user's computer
- Install/uninstall as a UXP `.ccx` through Creative Cloud Desktop

## Cloud backend
The backend runs server-side and uses yt-dlp + FFmpeg on the server only. It creates a short-lived signed download URL using S3/R2-compatible object storage.

## Deployment
1. Deploy `backend/` to a container host.
2. Configure environment variables from `backend/.env.example`.
3. Set `MEDIA_INGEST_API_KEY` to a strong secret.
4. Configure S3/R2 bucket credentials and endpoint.
5. Put the deployed `https://.../v1/resolve` endpoint into the plugin.

Never commit real API keys or storage credentials.