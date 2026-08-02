from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import Request

import app as core

app = core.app
_original_select_candidates = core.select_candidates


@app.middleware("http")
async def local_network_access_headers(request: Request, call_next):
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    response.headers["X-Neptune-Video-Engine"] = core.VERSION
    response.headers["Cache-Control"] = "no-store"
    return response


def select_candidates_with_crop(
    transcript: dict[str, Any],
    media: dict[str, Any],
    visual: dict[str, Any],
    metadata: dict[str, Any],
):
    candidates, provider, model = _original_select_candidates(transcript, media, visual, metadata)
    center = max(0.15, min(0.85, float(visual.get("faceCenterX") or 0.5)))
    for candidate in candidates:
        candidate["cropCenterX"] = center
        candidate["faceTracked"] = bool(visual.get("faceDetected"))
    return candidates, provider, model


def render_clip_with_smart_crop(
    source: Path,
    output: Path,
    subtitles: Path,
    candidate: dict[str, Any],
    media: dict[str, Any],
) -> None:
    start = float(candidate["startSeconds"])
    clip_duration = float(candidate["endSeconds"]) - start
    width, height = int(media["width"]), int(media["height"])
    crop_width = min(width, round(height * 9 / 16)) if width > height else width
    center = max(0.15, min(0.85, float(candidate.get("cropCenterX") or 0.5)))
    x = max(0, min(width - crop_width, round(center * width - crop_width / 2)))
    subtitle_path = str(subtitles).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
    if width > height and crop_width < width:
        video_filter = f"crop={crop_width}:{height}:{x}:0,scale=1080:1920,ass='{subtitle_path}'"
    else:
        video_filter = f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,ass='{subtitle_path}'"
    core.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-ss", f"{start:.3f}", "-i", str(source), "-t", f"{clip_duration:.3f}",
        "-vf", video_filter,
        "-map", "0:v:0", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart", "-y", str(output),
    ], timeout=max(900, round(clip_duration * 25)))
    if not output.exists() or output.stat().st_size < 20_000:
        raise RuntimeError("rendered_clip_empty")


core.select_candidates = select_candidates_with_crop
core.render_clip = render_clip_with_smart_crop
