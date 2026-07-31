from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import cv2
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl

app = FastAPI(title="Neptune Video AI Processor", version="1.0.0")
executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="neptune-video-ai")
active_jobs: dict[str, dict[str, Any]] = {}
active_lock = threading.Lock()


class JobRequest(BaseModel):
    jobId: str
    sourceName: str = "source.mp4"
    sourceUrl: HttpUrl
    transcribeUrl: HttpUrl
    analyzeUrl: HttpUrl
    completeUrl: HttpUrl
    failUrl: HttpUrl
    company: str = ""
    clientName: str = ""
    orderTitle: str = ""
    objective: str = ""


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "neptune-video-ai", "activeJobs": len(active_jobs)}


@app.get("/jobs/{job_id}")
def job_status(job_id: str) -> dict[str, Any]:
    with active_lock:
        state = active_jobs.get(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="job_not_found")
    return state


@app.post("/jobs", status_code=202)
def create_job(job: JobRequest) -> dict[str, Any]:
    job_id = safe_id(job.jobId)
    if not job_id:
        raise HTTPException(status_code=400, detail="invalid_job_id")
    with active_lock:
        current = active_jobs.get(job_id)
        if current and current.get("state") in {"queued", "processing"}:
            return {"ok": True, "accepted": False, "deduplicated": True, "jobId": job_id}
        active_jobs[job_id] = {"jobId": job_id, "state": "queued", "stage": "queued", "progress": 5}
    executor.submit(process_job, job)
    return {"ok": True, "accepted": True, "jobId": job_id}


def process_job(job: JobRequest) -> None:
    job_id = safe_id(job.jobId)
    workdir = Path(tempfile.mkdtemp(prefix=f"neptune-{job_id[:24]}-"))
    try:
        update_state(job_id, "processing", "download", 10)
        source_path = workdir / safe_filename(job.sourceName)
        download_file(str(job.sourceUrl), source_path)

        media = probe_media(source_path)
        update_state(job_id, "processing", "transcription", 22, media=media)
        transcript_result = transcribe_source(source_path, str(job.transcribeUrl), job)

        update_state(job_id, "processing", "visual_analysis", 42)
        visual_profile = analyze_visual_profile(source_path, media)

        update_state(job_id, "processing", "selection", 52)
        analysis = request_analysis(
            str(job.analyzeUrl),
            transcript_result,
            media,
            visual_profile,
            job,
        )
        candidates = analysis.get("candidates") or []
        if not candidates:
            raise RuntimeError("no_candidate_above_minimum_score")

        update_state(job_id, "processing", "rendering", 60, candidateCount=len(candidates))
        outputs: list[dict[str, Any]] = []
        for index, candidate in enumerate(candidates):
            clip_id = safe_id(str(candidate.get("id") or f"clip-{index + 1}"))
            output_path = workdir / f"{index + 1:02d}-{clip_id}.mp4"
            subtitle_path = workdir / f"{index + 1:02d}-{clip_id}.ass"
            write_ass_subtitles(
                subtitle_path,
                candidate.get("transcriptSegments") or [],
                float(candidate.get("startSeconds") or 0),
                float(candidate.get("endSeconds") or 0),
                str(candidate.get("captionPreset") or "neptune-contrast"),
            )
            render_clip(source_path, output_path, subtitle_path, candidate)
            upload = upload_output(str(candidate.get("outputUrl") or ""), output_path)
            outputs.append(
                {
                    "clipId": candidate.get("id"),
                    "key": candidate.get("outputKey"),
                    "sizeBytes": output_path.stat().st_size,
                    "etag": upload.get("etag", ""),
                }
            )
            progress = 60 + round(((index + 1) / len(candidates)) * 34)
            update_state(job_id, "processing", "rendering", progress, rendered=index + 1)

        completion_payload = {
            "analysis": analysis,
            "outputs": outputs,
            "media": media,
            "visualProfile": visual_profile,
            "transcriptVtt": transcript_result.get("vtt", ""),
        }
        post_json(str(job.completeUrl), completion_payload, timeout=180)
        update_state(job_id, "completed", "review_ready", 100, candidateCount=len(candidates))
    except Exception as error:  # noqa: BLE001 - must report any processing failure
        error_code = classify_error(error)
        update_state(job_id, "failed", error_code, active_jobs.get(job_id, {}).get("progress", 0), error=str(error)[:1200])
        try:
            post_json(
                str(job.failUrl),
                {
                    "stage": active_jobs.get(job_id, {}).get("stage", "processing"),
                    "progress": active_jobs.get(job_id, {}).get("progress", 0),
                    "errorCode": error_code,
                    "errorDetail": f"{type(error).__name__}: {error}",
                },
                timeout=60,
            )
        except Exception:  # noqa: BLE001
            traceback.print_exc()
        traceback.print_exc()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def download_file(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, timeout=httpx.Timeout(60, read=600), follow_redirects=True) as response:
        response.raise_for_status()
        with destination.open("wb") as output:
            for chunk in response.iter_bytes(chunk_size=1024 * 1024):
                output.write(chunk)
    if destination.stat().st_size < 1024:
        raise RuntimeError("downloaded_source_is_empty")


def probe_media(source: Path) -> dict[str, Any]:
    result = run_command(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=index,codec_type,width,height,r_frame_rate,codec_name",
            "-of",
            "json",
            str(source),
        ],
        timeout=120,
    )
    data = json.loads(result.stdout or "{}")
    streams = data.get("streams") or []
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), {})
    audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), {})
    duration = float((data.get("format") or {}).get("duration") or 0)
    if duration <= 0 or not video:
        raise RuntimeError("invalid_video_source")
    return {
        "durationSeconds": round(duration, 3),
        "width": int(video.get("width") or 0),
        "height": int(video.get("height") or 0),
        "videoCodec": str(video.get("codec_name") or ""),
        "audioCodec": str(audio.get("codec_name") or ""),
        "frameRate": parse_frame_rate(video.get("r_frame_rate")),
    }


def transcribe_source(source: Path, transcribe_url: str, job: JobRequest) -> dict[str, Any]:
    audio_dir = source.parent / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    pattern = str(audio_dir / "audio-%04d.mp3")
    run_command(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(source),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "48k",
            "-f",
            "segment",
            "-segment_time",
            "420",
            "-reset_timestamps",
            "1",
            pattern,
        ],
        timeout=1800,
    )
    chunks = sorted(audio_dir.glob("audio-*.mp3"))
    if not chunks:
        raise RuntimeError("audio_extraction_failed")

    context = ", ".join(filter(None, [job.company, job.clientName, job.orderTitle, "Neptune Media"]))[:500]
    merged_text: list[str] = []
    merged_segments: list[dict[str, Any]] = []
    offset = 0.0
    for chunk in chunks:
        duration = audio_duration(chunk)
        with chunk.open("rb") as audio:
            response = httpx.post(
                transcribe_url,
                params={"context": context},
                content=audio.read(),
                headers={"Content-Type": "audio/mpeg"},
                timeout=httpx.Timeout(60, read=600),
            )
        response.raise_for_status()
        result = response.json()
        text = clean_text(result.get("text", ""))
        if text:
            merged_text.append(text)
        chunk_segments = normalize_transcript_segments(result.get("segments") or [], result.get("vtt") or "")
        for segment in chunk_segments:
            merged_segments.append(
                {
                    "start": round(float(segment["start"]) + offset, 3),
                    "end": round(float(segment["end"]) + offset, 3),
                    "text": clean_text(segment["text"]),
                    "confidence": segment.get("confidence"),
                }
            )
        if not chunk_segments and text:
            merged_segments.append({"start": offset, "end": offset + duration, "text": text, "confidence": None})
        offset += duration

    transcript = clean_text(" ".join(merged_text))
    if len(transcript.split()) < 20:
        raise RuntimeError("transcription_too_short")
    return {
        "transcript": transcript,
        "segments": merged_segments,
        "vtt": segments_to_vtt(merged_segments),
    }


def normalize_transcript_segments(segments: list[Any], vtt: str) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for item in segments:
        if not isinstance(item, dict):
            continue
        timestamp = item.get("timestamp") or []
        start = item.get("start", item.get("start_seconds", timestamp[0] if len(timestamp) > 0 else None))
        end = item.get("end", item.get("end_seconds", timestamp[1] if len(timestamp) > 1 else None))
        try:
            start_value = float(start)
            end_value = float(end)
        except (TypeError, ValueError):
            continue
        text = clean_text(item.get("text", ""))
        if text and end_value > start_value:
            normalized.append({"start": start_value, "end": end_value, "text": text, "confidence": item.get("confidence")})
    return normalized or parse_vtt(vtt)


def parse_vtt(vtt: str) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    blocks = re.split(r"\n\s*\n", str(vtt or "").replace("\r", "\n"))
    timing_pattern = re.compile(r"(?P<start>\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})\s*-->\s*(?P<end>\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})")
    for block in blocks:
        match = timing_pattern.search(block)
        if not match:
            continue
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        text = clean_text(" ".join(line for line in lines if "-->" not in line and not line.isdigit()))
        if text:
            output.append({"start": parse_timestamp(match.group("start")), "end": parse_timestamp(match.group("end")), "text": text, "confidence": None})
    return output


def analyze_visual_profile(source: Path, media: dict[str, Any]) -> dict[str, Any]:
    capture = cv2.VideoCapture(str(source))
    duration = float(media.get("durationSeconds") or 0)
    sample_count = min(32, max(8, math.ceil(duration / 90)))
    luminances: list[float] = []
    contrasts: list[float] = []
    motions: list[float] = []
    face_counts: list[int] = []
    previous_gray = None
    classifier = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    try:
        for index in range(sample_count):
            second = duration * ((index + 0.5) / sample_count)
            capture.set(cv2.CAP_PROP_POS_MSEC, second * 1000)
            ok, frame = capture.read()
            if not ok or frame is None:
                continue
            small = resize_for_analysis(frame)
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            luminances.append(float(gray.mean()) / 255.0)
            contrasts.append(float(gray.std()) / 128.0)
            if previous_gray is not None and previous_gray.shape == gray.shape:
                motions.append(float(cv2.absdiff(previous_gray, gray).mean()) / 255.0)
            previous_gray = gray
            faces = classifier.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=5, minSize=(28, 28))
            face_counts.append(len(faces))
    finally:
        capture.release()
    luminance = mean(luminances, 0.5)
    contrast = min(1.0, mean(contrasts, 0.5))
    motion = min(1.0, mean(motions, 0.25) * 4)
    face_count = round(mean([float(value) for value in face_counts], 1.0))
    technical_quality = max(0.2, min(1.0, 0.45 + contrast * 0.28 + (1 - abs(luminance - 0.52)) * 0.22 - motion * 0.08))
    return {
        "luminance": round(luminance, 4),
        "contrast": round(contrast, 4),
        "motion": round(motion, 4),
        "faceCount": int(face_count),
        "technicalQuality": round(technical_quality, 4),
        "sampleCount": len(luminances),
        "recommendedCaptionPreset": choose_caption_preset(luminance, contrast, motion),
    }


def request_analysis(
    url: str,
    transcript: dict[str, Any],
    media: dict[str, Any],
    visual_profile: dict[str, Any],
    job: JobRequest,
) -> dict[str, Any]:
    payload = {
        "transcript": transcript.get("transcript", ""),
        "segments": transcript.get("segments", []),
        "media": media,
        "visualProfile": visual_profile,
        "company": job.company,
        "clientName": job.clientName,
        "orderTitle": job.orderTitle,
        "objective": job.objective,
    }
    response = httpx.post(url, json=payload, timeout=httpx.Timeout(60, read=900))
    response.raise_for_status()
    result = response.json()
    if not result.get("ok"):
        raise RuntimeError(f"analysis_rejected:{json.dumps(result)[:300]}")
    result["transcript"] = transcript.get("transcript", "")
    return result


def render_clip(source: Path, output: Path, subtitles: Path, candidate: dict[str, Any]) -> None:
    start = max(0.0, float(candidate.get("startSeconds") or 0))
    end = max(start + 0.2, float(candidate.get("endSeconds") or 0))
    duration = end - start
    subtitle_filter = escape_ffmpeg_path(subtitles)
    filter_complex = (
        "[0:v]split=2[bg][fg];"
        "[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=34[bgv];"
        "[fg]scale=1080:1920:force_original_aspect_ratio=decrease[fgv];"
        "[bgv][fgv]overlay=(W-w)/2:(H-h)/2,"
        f"ass='{subtitle_filter}'[v]"
    )
    run_command(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            f"{start:.3f}",
            "-i",
            str(source),
            "-t",
            f"{duration:.3f}",
            "-filter_complex",
            filter_complex,
            "-map",
            "[v]",
            "-map",
            "0:a?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "21",
            "-profile:v",
            "high",
            "-level",
            "4.1",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-ar",
            "48000",
            "-movflags",
            "+faststart",
            "-y",
            str(output),
        ],
        timeout=max(600, int(duration * 20)),
    )
    if not output.exists() or output.stat().st_size < 20_000:
        raise RuntimeError("rendered_clip_is_empty")


def write_ass_subtitles(path: Path, segments: list[Any], clip_start: float, clip_end: float, preset: str) -> None:
    style = subtitle_style(preset)
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Neptune,DejaVu Sans,{style['font_size']},{style['primary']},{style['accent']},{style['outline']},{style['back']},1,0,0,0,100,100,0,0,{style['border_style']},{style['outline_size']},{style['shadow']},2,70,70,{style['margin_v']},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events: list[str] = []
    normalized = normalize_segments_for_clip(segments, clip_start, clip_end)
    for segment in normalized:
        chunks = split_caption(segment["text"], max_words=7)
        duration = max(0.4, segment["end"] - segment["start"])
        for index, text in enumerate(chunks):
            start = segment["start"] + duration * (index / len(chunks))
            end = segment["start"] + duration * ((index + 1) / len(chunks))
            highlighted = highlight_caption(text, style["accent"])
            events.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Neptune,,0,0,0,,{highlighted}")
    if not events:
        events.append("Dialogue: 0,0:00:00.00,0:00:01.00,Neptune,,0,0,0,,")
    path.write_text(header + "\n".join(events) + "\n", encoding="utf-8")


def subtitle_style(preset: str) -> dict[str, Any]:
    styles = {
        "neptune-light": {
            "font_size": 66,
            "primary": "&H00FFFFFF",
            "accent": "&H0023D7FF",
            "outline": "&HAA06183F",
            "back": "&H55000000",
            "border_style": 1,
            "outline_size": 4,
            "shadow": 2,
            "margin_v": 230,
        },
        "neptune-boxed": {
            "font_size": 62,
            "primary": "&H00FFFFFF",
            "accent": "&H0023D7FF",
            "outline": "&H0006183F",
            "back": "&HC006183F",
            "border_style": 3,
            "outline_size": 3,
            "shadow": 0,
            "margin_v": 230,
        },
        "neptune-premium": {
            "font_size": 61,
            "primary": "&H00FFFFFF",
            "accent": "&H00DFA3FF",
            "outline": "&HCC06183F",
            "back": "&H33000000",
            "border_style": 1,
            "outline_size": 3,
            "shadow": 1,
            "margin_v": 245,
        },
        "neptune-contrast": {
            "font_size": 66,
            "primary": "&H00FFFFFF",
            "accent": "&H0023D7FF",
            "outline": "&HFF06183F",
            "back": "&H55000000",
            "border_style": 1,
            "outline_size": 5,
            "shadow": 2,
            "margin_v": 225,
        },
    }
    return styles.get(preset, styles["neptune-contrast"])


def normalize_segments_for_clip(segments: list[Any], clip_start: float, clip_end: float) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for raw in segments:
        if not isinstance(raw, dict):
            continue
        try:
            start = float(raw.get("start", raw.get("startSeconds", 0)))
            end = float(raw.get("end", raw.get("endSeconds", 0)))
        except (TypeError, ValueError):
            continue
        if end <= clip_start or start >= clip_end:
            continue
        text = clean_text(raw.get("text", ""))
        if not text:
            continue
        output.append(
            {
                "start": max(0.0, start - clip_start),
                "end": max(0.2, min(clip_end, end) - clip_start),
                "text": text,
            }
        )
    return output


def split_caption(text: str, max_words: int = 7) -> list[str]:
    words = clean_text(text).split()
    if not words:
        return []
    chunks: list[str] = []
    cursor = 0
    while cursor < len(words):
        remaining = len(words) - cursor
        count = min(max_words, remaining)
        if remaining > max_words and count > 4:
            window = words[cursor : cursor + count]
            punctuation_index = next((index for index in range(len(window) - 1, 2, -1) if re.search(r"[,;:]$", window[index])), None)
            if punctuation_index is not None:
                count = punctuation_index + 1
        chunks.append(" ".join(words[cursor : cursor + count]))
        cursor += count
    return chunks


def highlight_caption(text: str, accent: str) -> str:
    strong_pattern = re.compile(
        r"\b(jamais|toujours|erreur|problème|solution|résultat|vraiment|personne|tout|client|argent|temps|important|exactement|pourquoi|comment)\b",
        re.IGNORECASE,
    )
    escaped = ass_escape(text)
    return strong_pattern.sub(lambda match: f"{{\\c{accent}}}{match.group(0)}{{\\c&H00FFFFFF}}", escaped)


def upload_output(url: str, output: Path) -> dict[str, Any]:
    if not url:
        raise RuntimeError("output_url_missing")
    with output.open("rb") as stream:
        response = httpx.put(
            url,
            content=stream,
            headers={"Content-Type": "video/mp4", "Content-Length": str(output.stat().st_size)},
            timeout=httpx.Timeout(60, read=900),
        )
    response.raise_for_status()
    return response.json()


def post_json(url: str, payload: dict[str, Any], timeout: int = 120) -> dict[str, Any]:
    response = httpx.post(url, json=payload, timeout=httpx.Timeout(60, read=timeout))
    response.raise_for_status()
    if not response.content:
        return {}
    return response.json()


def audio_duration(path: Path) -> float:
    result = run_command(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        timeout=60,
    )
    try:
        return max(0.1, float(result.stdout.strip()))
    except ValueError:
        return 420.0


def run_command(command: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"command_failed:{Path(command[0]).name}:{result.stderr[-1200:]}")
    return result


def resize_for_analysis(frame: Any) -> Any:
    height, width = frame.shape[:2]
    scale = min(1.0, 640 / max(width, height))
    if scale >= 1:
        return frame
    return cv2.resize(frame, (max(1, round(width * scale)), max(1, round(height * scale))), interpolation=cv2.INTER_AREA)


def segments_to_vtt(segments: list[dict[str, Any]]) -> str:
    lines = ["WEBVTT", ""]
    for index, segment in enumerate(segments, 1):
        lines.extend(
            [
                str(index),
                f"{vtt_time(float(segment['start']))} --> {vtt_time(float(segment['end']))}",
                clean_text(segment.get("text", "")),
                "",
            ]
        )
    return "\n".join(lines)


def choose_caption_preset(luminance: float, contrast: float, motion: float) -> str:
    if contrast < 0.32:
        return "neptune-boxed"
    if luminance < 0.38:
        return "neptune-light"
    if contrast > 0.65 and motion < 0.35:
        return "neptune-premium"
    return "neptune-contrast"


def classify_error(error: Exception) -> str:
    message = str(error).lower()
    if "download" in message:
        return "source_download_failed"
    if "audio" in message or "transcription" in message:
        return "transcription_failed"
    if "analysis" in message or "candidate" in message:
        return "semantic_analysis_failed"
    if "render" in message or "ffmpeg" in message or "command_failed" in message:
        return "video_render_failed"
    if "output" in message or "upload" in message:
        return "output_upload_failed"
    return "video_processing_failed"


def update_state(job_id: str, state: str, stage: str, progress: int, **extra: Any) -> None:
    with active_lock:
        active_jobs[job_id] = {
            **active_jobs.get(job_id, {}),
            "jobId": job_id,
            "state": state,
            "stage": stage,
            "progress": max(0, min(100, int(progress))),
            **extra,
        }


def parse_frame_rate(value: Any) -> float:
    try:
        numerator, denominator = str(value or "0/1").split("/", 1)
        return round(float(numerator) / max(1.0, float(denominator)), 3)
    except (ValueError, ZeroDivisionError):
        return 0.0


def parse_timestamp(value: str) -> float:
    parts = str(value).replace(",", ".").split(":")
    try:
        if len(parts) == 2:
            return float(parts[0]) * 60 + float(parts[1])
        if len(parts) == 3:
            return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    except ValueError:
        return 0.0
    return 0.0


def ass_time(seconds: float) -> str:
    value = max(0.0, seconds)
    hours = int(value // 3600)
    minutes = int((value % 3600) // 60)
    remaining = value % 60
    return f"{hours}:{minutes:02d}:{remaining:05.2f}"


def vtt_time(seconds: float) -> str:
    value = max(0.0, seconds)
    hours = int(value // 3600)
    minutes = int((value % 3600) // 60)
    remaining = value % 60
    return f"{hours:02d}:{minutes:02d}:{remaining:06.3f}"


def escape_ffmpeg_path(path: Path) -> str:
    return str(path).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'").replace("[", "\\[").replace("]", "\\]")


def ass_escape(value: str) -> str:
    return str(value).replace("\\", r"\\").replace("{", r"\{").replace("}", r"\}").replace("\n", r"\N")


def safe_id(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", str(value or "")).strip("-")[:180]


def safe_filename(value: str) -> str:
    name = re.sub(r"[\r\n\"\\/]+", "_", str(value or "source.mp4")).strip()[:220]
    return name or "source.mp4"


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", str(value or ""))).strip()


def mean(values: list[float], fallback: float) -> float:
    return sum(values) / len(values) if values else fallback
