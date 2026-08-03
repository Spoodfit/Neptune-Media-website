from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import Request

import app as core

app = core.app
_original_select_candidates = core.select_candidates
TEST_MODE = os.getenv("NEPTUNE_ENGINE_TEST_MODE", "").strip() == "1"


@app.middleware("http")
async def local_network_access_headers(request: Request, call_next):
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    response.headers["X-Neptune-Video-Engine"] = core.VERSION
    response.headers["Cache-Control"] = "no-store"
    return response


def visual_profile_resilient(source: Path, media: dict[str, Any]) -> dict[str, Any]:
    video_capture = getattr(core.cv2, "VideoCapture", None)
    if not callable(video_capture):
        return {
            "luminance": 0.5,
            "contrast": 0.5,
            "faceCenterX": 0.5,
            "faceDetected": False,
            "faceDetector": "unavailable",
            "sampleCount": 0,
            "recommendedCaptionPreset": "neptune-premium",
        }

    capture = video_capture(str(source))
    classifier = None
    classifier_type = getattr(core.cv2, "CascadeClassifier", None)
    cascade_root = getattr(getattr(core.cv2, "data", None), "haarcascades", "")
    if callable(classifier_type) and cascade_root:
        try:
            candidate = classifier_type(cascade_root + "haarcascade_frontalface_default.xml")
            if not getattr(candidate, "empty", lambda: True)():
                classifier = candidate
        except Exception:
            classifier = None

    duration = float(media["durationSeconds"])
    samples = max(8, min(36, round(duration / 60)))
    face_centers: list[float] = []
    luminance: list[float] = []
    contrast: list[float] = []
    try:
        for index in range(samples):
            capture.set(core.cv2.CAP_PROP_POS_MSEC, duration * (index + 0.5) / samples * 1000)
            ok, frame = capture.read()
            if not ok or frame is None:
                continue
            scale = min(1.0, 720 / max(frame.shape[:2]))
            small = core.cv2.resize(frame, None, fx=scale, fy=scale) if scale < 1 else frame
            gray = core.cv2.cvtColor(small, core.cv2.COLOR_BGR2GRAY)
            luminance.append(float(gray.mean()) / 255)
            contrast.append(min(1.0, float(gray.std()) / 100))
            if classifier is not None:
                try:
                    faces = classifier.detectMultiScale(gray, 1.12, 5, minSize=(30, 30))
                except Exception:
                    faces = []
                if len(faces):
                    x, _, width, _ = max(faces, key=lambda item: item[2] * item[3])
                    face_centers.append((x + width / 2) / small.shape[1])
    finally:
        capture.release()

    return {
        "luminance": round(float(core.np.mean(luminance)) if luminance else 0.5, 4),
        "contrast": round(float(core.np.mean(contrast)) if contrast else 0.5, 4),
        "faceCenterX": round(float(core.np.median(face_centers)) if face_centers else 0.5, 4),
        "faceDetected": bool(face_centers),
        "faceDetector": "opencv-haar" if classifier is not None else "center-fallback",
        "sampleCount": len(luminance),
        "recommendedCaptionPreset": "neptune-premium",
    }


def test_transcribe(source: Path, job_dir: Path, job_id: str) -> dict[str, Any]:
    media = core.probe_media(source)
    duration = max(10.0, float(media["durationSeconds"]))
    phrases = [
        "Pourquoi une entreprise sérieuse peut-elle rester invisible malgré la qualité de son travail ?",
        "Le problème vient souvent d'une promesse trop abstraite que le client ne comprend pas immédiatement.",
        "Une méthode simple consiste à nommer le problème, montrer sa conséquence et apporter une preuve concrète.",
        "Cette structure clarifie le message, retient l'attention et facilite la décision du futur client.",
    ]
    segment_duration = duration / len(phrases)
    segments = [
        {
            "start": round(index * segment_duration, 3),
            "end": round(min(duration, (index + 1) * segment_duration), 3),
            "text": phrase,
        }
        for index, phrase in enumerate(phrases)
    ]
    core.update_job(job_id, stage="transcription de test", progress=42)
    return {
        "text": " ".join(phrases),
        "segments": segments,
        "vtt": core.to_vtt(segments),
    }


def select_candidates_with_crop(
    transcript: dict[str, Any],
    media: dict[str, Any],
    visual: dict[str, Any],
    metadata: dict[str, Any],
):
    if TEST_MODE:
        duration = float(media["durationSeconds"])
        raw = [{
            "startSeconds": 0,
            "endSeconds": max(10, min(duration, 12)),
            "title": "Pourquoi une entreprise sérieuse reste invisible",
            "funnel": "MOFU",
            "score": 82,
            "hook": "Votre entreprise est sérieuse, mais est-ce que cela se voit ?",
            "rationale": "Validation intégrale du pipeline Neptune en environnement isolé.",
        }]
        candidates = core.normalize_candidates(raw, transcript["segments"], duration)
        provider, model = "ci-deterministic", "neptune-ci-v1"
    else:
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


core.visual_profile = visual_profile_resilient
if TEST_MODE:
    core.transcribe = test_transcribe
core.select_candidates = select_candidates_with_crop
core.render_clip = render_clip_with_smart_crop

# Keep the historical runtime entrypoint while delegating the active engine to v74.
from runtime_v75 import app as app  # noqa: E402,F401
