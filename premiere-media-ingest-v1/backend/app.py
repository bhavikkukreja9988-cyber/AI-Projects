import os, secrets, subprocess, tempfile, time
from pathlib import Path
from urllib.parse import urlparse
from fastapi import FastAPI, Header, HTTPException
import boto3
from pydantic import BaseModel, HttpUrl, Field

APP_NAME = "Media Ingest Resolver"
API_KEY = os.getenv("MEDIA_INGEST_API_KEY", "")
MAX_SECONDS = int(os.getenv("MAX_CLIP_SECONDS", "300"))
MAX_BYTES = int(os.getenv("MAX_OUTPUT_BYTES", str(1024 * 1024 * 1024)))
S3_BUCKET = os.getenv("S3_BUCKET", "")
S3_REGION = os.getenv("S3_REGION", "auto")
S3_ENDPOINT = os.getenv("S3_ENDPOINT_URL", "")
S3_PREFIX = os.getenv("S3_PREFIX", "media-ingest/")
SIGNED_URL_SECONDS = int(os.getenv("SIGNED_URL_TTL_SECONDS", "900"))
app = FastAPI(title=APP_NAME, version="1.0.0")

class ResolveRequest(BaseModel):
    version: str = "1.0.0"
    url: HttpUrl
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    quality: str = "1080p"
    format: str = "mp4"
    includeAudio: bool = True

def check_auth(auth: str | None):
    if not API_KEY:
        raise HTTPException(503, "Resolver API key is not configured")
    scheme, _, token = auth.partition(" ") if auth else ("", "", "")
    if scheme.lower() != "bearer" or not secrets.compare_digest(token, API_KEY):
        raise HTTPException(403, "Invalid API key")

def validate_url(url: str):
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    allowed = ("youtube.com", "youtu.be", "instagram.com", "facebook.com", "fb.watch")
    if not any(host == d or host.endswith("." + d) for d in allowed):
        raise HTTPException(400, "Only YouTube, Instagram, and Facebook URLs are supported")

def run(cmd: list[str], cwd: Path):
    p = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=900)
    if p.returncode != 0:
        raise RuntimeError(p.stdout[-6000:])

@app.get("/")
def health(authorization: str | None = Header(default=None)):
    check_auth(authorization)
    return {"name": APP_NAME, "status": "ok", "version": "1.0.0"}

@app.post("/v1/resolve")
def resolve(req: ResolveRequest, authorization: str | None = Header(default=None)):
    check_auth(authorization)
    validate_url(str(req.url))
    if req.end <= req.start:
        raise HTTPException(400, "end must be after start")
    if req.end - req.start > MAX_SECONDS:
        raise HTTPException(400, f"Maximum clip length is {MAX_SECONDS} seconds")
    with tempfile.TemporaryDirectory(prefix="media-ingest-") as td:
        work = Path(td)
        out = work / "clip.%(ext)s"
        section = f"*{req.start}-{req.end}"
        cmd = ["yt-dlp", "--no-playlist", "--quiet", "--no-warnings", "--download-sections", section, "--force-keyframes-at-cuts", "--merge-output-format", "mp4", "-f", "bv*+ba/b", "-o", str(out), str(req.url)]
        try:
            run(cmd, work)
        except subprocess.TimeoutExpired:
            raise HTTPException(504, "Resolver timed out")
        except Exception as exc:
            raise HTTPException(422, f"Could not resolve media: {exc}")
        candidates = [p for p in work.iterdir() if p.is_file() and p.suffix.lower() in {".mp4", ".mkv", ".webm", ".mov"}]
        if not candidates:
            raise HTTPException(422, "No output media was produced")
        src = max(candidates, key=lambda p: p.stat().st_size)
        if src.stat().st_size > MAX_BYTES:
            raise HTTPException(413, "Output clip exceeds configured size limit")
        if not S3_BUCKET:
            raise HTTPException(503, "Resolver storage is not configured")
        key = f"{S3_PREFIX.rstrip('/')}/{int(time.time())}-{secrets.token_hex(8)}.mp4"
        kwargs = {"region_name": S3_REGION}
        if S3_ENDPOINT:
            kwargs["endpoint_url"] = S3_ENDPOINT
        s3 = boto3.client("s3", **kwargs)
        try:
            s3.upload_file(str(src), S3_BUCKET, key, ExtraArgs={"ContentType": "video/mp4"})
            signed = s3.generate_presigned_url("get_object", Params={"Bucket": S3_BUCKET, "Key": key}, ExpiresIn=SIGNED_URL_SECONDS)
        except Exception as exc:
            raise HTTPException(502, f"Storage upload failed: {exc}")
        return {"downloadUrl": signed, "filename": f"media-ingest-{int(req.start)}-{int(req.end)}.mp4", "expiresIn": SIGNED_URL_SECONDS}
