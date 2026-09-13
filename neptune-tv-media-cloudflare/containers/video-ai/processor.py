from __future__ import annotations

import base64
import math
import re
import shutil
import subprocess
import tempfile
import threading
import time
import traceback
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterator

import cv2
import httpx

import app as legacy

app = legacy.app


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def update_state(job_id: str, state: str, stage: str, progress: int, **extra: Any) -> None:
    now = iso_now()
    event_label = str(extra.pop("event", "") or "").strip()
    metrics_delta = extra.pop("metrics", None)
    with legacy.active_lock:
        previous = dict(legacy.active_jobs.get(job_id, {}))
        previous_metrics = previous.get("metrics") if isinstance(previous.get("metrics"), dict) else {}
        metrics = {**previous_metrics, **(metrics_delta if isinstance(metrics_delta, dict) else {})}
        activity = str(extra.get("activity") or previous.get("activity") or stage).strip()
        detail = str(extra.get("detail") or previous.get("detail") or "").strip()
        events = list(previous.get("events") or [])[-11:]
        stage_changed = stage != previous.get("stage")
        activity_changed = activity != previous.get("activity")
        if event_label or stage_changed or activity_changed:
            events.append({
                "at": now,
                "stage": stage,
                "label": event_label or activity,
                "detail": detail[:240],
            })
        started_at = previous.get("startedAt") or now
        stage_started_at = now if stage_changed else previous.get("stageStartedAt") or now
        legacy.active_jobs[job_id] = {
            **previous,
            "jobId": job_id,
            "state": state,
            "stage": stage,
            "progress": max(0, min(100, int(progress))),
            "activity": activity,
            "detail": detail,
            "metrics": metrics,
            "events": events,
            "startedAt": started_at,
            "stageStartedAt": stage_started_at,
            "updatedAt": now,
            "heartbeatAt": now,
            "elapsedSeconds": max(0, round(time.time() - parse_iso_epoch(started_at))),
            **extra,
        }


def pulse_state(job_id: str, detail: str | None = None, metrics: dict[str, Any] | None = None) -> None:
    now = iso_now()
    with legacy.active_lock:
        current = dict(legacy.active_jobs.get(job_id, {}))
        if not current:
            return
        current_metrics = current.get("metrics") if isinstance(current.get("metrics"), dict) else {}
        if metrics:
            current_metrics = {**current_metrics, **metrics}
        current["metrics"] = current_metrics
        if detail is not None:
            current["detail"] = str(detail)[:500]
        current["updatedAt"] = now
        current["heartbeatAt"] = now
        current["elapsedSeconds"] = max(0, round(time.time() - parse_iso_epoch(current.get("startedAt") or now)))
        legacy.active_jobs[job_id] = current


@contextmanager
def heartbeat(job_id: str, detail: str, interval: float = 3.0) -> Iterator[None]:
    stopped = threading.Event()

    def run() -> None:
        while not stopped.wait(interval):
            pulse_state(job_id, detail)

    thread = threading.Thread(target=run, daemon=True, name=f"neptune-heartbeat-{job_id[:18]}")
    thread.start()
    try:
        yield
    finally:
        stopped.set()
        thread.join(timeout=0.25)


def process_job(job: legacy.JobRequest) -> None:
    job_id = legacy.safe_id(job.jobId)
    workdir = Path(tempfile.mkdtemp(prefix=f"neptune-{job_id[:24]}-"))
    try:
        update_state(
            job_id,
            "processing",
            "starting",
            9,
            activity="Moteur vidéo démarré",
            detail="Préparation de l’espace de travail sécurisé.",
            event="Container prêt",
        )
        source_path = workdir / legacy.safe_filename(job.sourceName)
        update_state(
            job_id,
            "processing",
            "download",
            10,
            activity="Téléchargement sécurisé de la source",
            detail="Lecture de la vidéo depuis le stockage privé Neptune.",
            event="Téléchargement commencé",
        )
        download_file_live(str(job.sourceUrl), source_path, job_id)

        update_state(
            job_id,
            "processing",
            "probe",
            21,
            activity="Lecture des caractéristiques vidéo",
            detail="Vérification du codec, de la durée, de l’audio et du nombre d’images par seconde.",
        )
        with heartbeat(job_id, "FFprobe inspecte la vidéo et ses pistes audio."):
            media = legacy.probe_media(source_path)
        preview = make_vertical_preview(source_path, min(8.0, max(0.0, float(media.get("durationSeconds") or 0) * 0.08)))
        update_state(
            job_id,
            "processing",
            "transcription",
            22,
            activity="Extraction et transcription audio",
            detail="Découpage de l’audio en blocs courts pour une transcription fiable.",
            media=media,
            previewDataUrl=preview,
            previewLabel="Aperçu vertical de la vidéo source",
            event="Vidéo décodée",
        )
        transcript_result = transcribe_source_live(source_path, str(job.transcribeUrl), job, job_id, media)

        update_state(
            job_id,
            "processing",
            "visual_analysis",
            43,
            activity="Analyse visuelle de la vidéo",
            detail="Neptune mesure lumière, contraste, mouvement et présence de visages.",
            event="Transcription terminée",
        )
        visual_profile = analyze_visual_profile_live(source_path, media, job_id)

        update_state(
            job_id,
            "processing",
            "selection",
            52,
            activity="Sélection éditoriale OpenAI",
            detail="Qualification TOFU, MOFU et BOFU, notation et élimination des doublons.",
            event="Analyse sémantique lancée",
        )
        with heartbeat(job_id, "OpenAI compare les passages et construit les propositions éditoriales."):
            analysis = legacy.request_analysis(
                str(job.analyzeUrl),
                transcript_result,
                media,
                visual_profile,
                job,
            )
        candidates = analysis.get("candidates") or []
        if not candidates:
            raise RuntimeError("no_candidate_above_minimum_score")

        update_state(
            job_id,
            "processing",
            "rendering",
            60,
            activity="Montage vertical des shorts",
            detail=f"{len(candidates)} passage(s) retenu(s). FFmpeg prépare le premier rendu.",
            candidateCount=len(candidates),
            rendered=0,
            event=f"{len(candidates)} passage(s) retenu(s)",
        )
        outputs: list[dict[str, Any]] = []
        for index, candidate in enumerate(candidates):
            clip_id = legacy.safe_id(str(candidate.get("id") or f"clip-{index + 1}"))
            title = legacy.clean_text(candidate.get("title") or f"Short {index + 1}")
            output_path = workdir / f"{index + 1:02d}-{clip_id}.mp4"
            subtitle_path = workdir / f"{index + 1:02d}-{clip_id}.ass"
            start_seconds = float(candidate.get("startSeconds") or 0)
            end_seconds = float(candidate.get("endSeconds") or start_seconds + 1)
            source_preview = make_vertical_preview(source_path, max(start_seconds, (start_seconds + end_seconds) / 2))
            update_state(
                job_id,
                "processing",
                "rendering",
                60 + round((index / max(1, len(candidates))) * 34),
                activity=f"Montage du short {index + 1}/{len(candidates)}",
                detail=title,
                currentClip={"index": index + 1, "total": len(candidates), "id": clip_id, "title": title},
                previewDataUrl=source_preview or legacy.active_jobs.get(job_id, {}).get("previewDataUrl", ""),
                previewLabel=f"Cadre sélectionné · {title}",
                event=f"Montage du short {index + 1}",
            )
            legacy.write_ass_subtitles(
                subtitle_path,
                candidate.get("transcriptSegments") or [],
                start_seconds,
                end_seconds,
                str(candidate.get("captionPreset") or "neptune-contrast"),
            )
            render_clip_live(source_path, output_path, subtitle_path, candidate, job_id, index, len(candidates), title)
            update_state(
                job_id,
                "processing",
                "rendering",
                60 + round(((index + 0.92) / max(1, len(candidates))) * 34),
                activity=f"Enregistrement du short {index + 1}/{len(candidates)}",
                detail="Envoi du rendu final dans le stockage privé Neptune.",
            )
            with heartbeat(job_id, "Le rendu final est transféré dans le stockage sécurisé Neptune."):
                upload = legacy.upload_output(str(candidate.get("outputUrl") or ""), output_path)
            final_preview = make_vertical_preview(output_path, min(1.5, max(0.1, end_seconds - start_seconds - 0.1)))
            outputs.append(
                {
                    "clipId": candidate.get("id"),
                    "key": candidate.get("outputKey"),
                    "sizeBytes": output_path.stat().st_size,
                    "etag": upload.get("etag", ""),
                }
            )
            progress = 60 + round(((index + 1) / len(candidates)) * 34)
            update_state(
                job_id,
                "processing",
                "rendering",
                progress,
                activity=f"Short {index + 1}/{len(candidates)} terminé",
                detail=title,
                rendered=index + 1,
                previewDataUrl=final_preview or source_preview,
                previewLabel=f"Rendu final · {title}",
                event=f"Short {index + 1} rendu",
            )

        update_state(
            job_id,
            "processing",
            "finalization",
            97,
            activity="Finalisation de la production",
            detail="Enregistrement de la transcription, des scores et des fichiers rendus.",
            event="Rendus terminés",
        )
        completion_payload = {
            "analysis": analysis,
            "outputs": outputs,
            "media": media,
            "visualProfile": visual_profile,
            "transcriptVtt": transcript_result.get("vtt", ""),
        }
        with heartbeat(job_id, "Neptune consolide les contenus et prépare l’écran de validation."):
            legacy.post_json(str(job.completeUrl), completion_payload, timeout=180)
        update_state(
            job_id,
            "completed",
            "review_ready",
            100,
            activity="Shorts prêts à valider",
            detail=f"{len(candidates)} contenu(s) disponibles dans le Studio.",
            candidateCount=len(candidates),
            event="Production terminée",
        )
    except Exception as error:  # noqa: BLE001
        error_code = legacy.classify_error(error)
        with legacy.active_lock:
            current = dict(legacy.active_jobs.get(job_id, {}))
        update_state(
            job_id,
            "failed",
            error_code,
            int(current.get("progress", 0)),
            activity="Traitement interrompu",
            detail=str(error)[:900],
            error=str(error)[:1200],
            event=f"Échec · {error_code}",
        )
        try:
            legacy.post_json(
                str(job.failUrl),
                {
                    "stage": legacy.active_jobs.get(job_id, {}).get("stage", "processing"),
                    "progress": legacy.active_jobs.get(job_id, {}).get("progress", 0),
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


def download_file_live(url: str, destination: Path, job_id: str) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    last_emit = 0.0
    downloaded = 0
    with httpx.stream("GET", url, timeout=httpx.Timeout(60, read=600), follow_redirects=True) as response:
        response.raise_for_status()
        total = int(response.headers.get("Content-Length") or 0)
        with destination.open("wb") as output:
            for chunk in response.iter_bytes(chunk_size=1024 * 1024):
                output.write(chunk)
                downloaded += len(chunk)
                now = time.monotonic()
                if now - last_emit >= 0.7:
                    elapsed = max(0.1, now - started)
                    rate = downloaded / elapsed
                    ratio = downloaded / total if total > 0 else 0
                    progress = 10 + round(min(1.0, ratio) * 10) if total > 0 else min(19, 10 + int(downloaded / (64 * 1024 * 1024)))
                    remaining = max(0, round((total - downloaded) / rate)) if total > downloaded and rate > 0 else 0
                    update_state(
                        job_id,
                        "processing",
                        "download",
                        progress,
                        activity="Téléchargement sécurisé de la source",
                        detail=f"{format_bytes(downloaded)} reçus" + (f" sur {format_bytes(total)}" if total else ""),
                        metrics={
                            "downloadedBytes": downloaded,
                            "totalBytes": total,
                            "bytesPerSecond": round(rate),
                            "remainingSeconds": remaining,
                        },
                    )
                    last_emit = now
    if destination.stat().st_size < 1024:
        raise RuntimeError("downloaded_source_is_empty")
    update_state(
        job_id,
        "processing",
        "download",
        20,
        activity="Vidéo source téléchargée",
        detail=f"{format_bytes(destination.stat().st_size)} disponibles dans le moteur.",
        metrics={"downloadedBytes": destination.stat().st_size, "totalBytes": destination.stat().st_size, "remainingSeconds": 0},
        event="Téléchargement terminé",
    )


def transcribe_source_live(
    source: Path,
    transcribe_url: str,
    job: legacy.JobRequest,
    job_id: str,
    media: dict[str, Any],
) -> dict[str, Any]:
    audio_dir = source.parent / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    pattern = str(audio_dir / "audio-%04d.mp3")
    duration = max(1.0, float(media.get("durationSeconds") or 1))
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-progress", "pipe:1", "-nostats",
        "-i", str(source), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k",
        "-f", "segment", "-segment_time", "420", "-reset_timestamps", "1", pattern,
    ]

    def extraction_progress(seconds: float) -> None:
        ratio = min(1.0, seconds / duration)
        update_state(
            job_id,
            "processing",
            "transcription",
            22 + round(ratio * 6),
            activity="Extraction de la piste audio",
            detail=f"{format_duration(seconds)} analysées sur {format_duration(duration)}.",
            metrics={"processedVideoSeconds": round(seconds, 1), "videoDurationSeconds": round(duration, 1)},
        )

    run_ffmpeg_progress(command, timeout=1800, callback=extraction_progress)
    chunks = sorted(audio_dir.glob("audio-*.mp3"))
    if not chunks:
        raise RuntimeError("audio_extraction_failed")

    context = ", ".join(filter(None, [job.company, job.clientName, job.orderTitle, "Neptune Media"]))[:500]
    merged_text: list[str] = []
    merged_segments: list[dict[str, Any]] = []
    offset = 0.0
    total_chunks = len(chunks)
    for index, chunk in enumerate(chunks):
        chunk_duration = legacy.audio_duration(chunk)
        progress = 28 + round((index / max(1, total_chunks)) * 14)
        update_state(
            job_id,
            "processing",
            "transcription",
            progress,
            activity=f"Transcription du bloc {index + 1}/{total_chunks}",
            detail=f"Audio {format_duration(offset)} → {format_duration(offset + chunk_duration)}.",
            metrics={"transcribedChunks": index, "totalChunks": total_chunks, "transcribedSeconds": round(offset, 1)},
        )
        with chunk.open("rb") as audio, heartbeat(job_id, f"OpenAI transcrit le bloc audio {index + 1}/{total_chunks}."):
            response = httpx.post(
                transcribe_url,
                params={"context": context},
                content=audio.read(),
                headers={"Content-Type": "audio/mpeg"},
                timeout=httpx.Timeout(60, read=600),
            )
        response.raise_for_status()
        result = response.json()
        text = legacy.clean_text(result.get("text", ""))
        if text:
            merged_text.append(text)
        chunk_segments = legacy.normalize_transcript_segments(result.get("segments") or [], result.get("vtt") or "")
        for segment in chunk_segments:
            merged_segments.append({
                "start": round(float(segment["start"]) + offset, 3),
                "end": round(float(segment["end"]) + offset, 3),
                "text": legacy.clean_text(segment["text"]),
                "confidence": segment.get("confidence"),
            })
        if not chunk_segments and text:
            merged_segments.append({"start": offset, "end": offset + chunk_duration, "text": text, "confidence": None})
        offset += chunk_duration
        update_state(
            job_id,
            "processing",
            "transcription",
            28 + round(((index + 1) / total_chunks) * 14),
            activity=f"Bloc {index + 1}/{total_chunks} transcrit",
            detail=f"{sum(len(item.split()) for item in merged_text)} mots reconnus.",
            metrics={"transcribedChunks": index + 1, "totalChunks": total_chunks, "transcribedSeconds": round(offset, 1)},
            event=f"Bloc audio {index + 1} transcrit",
        )

    transcript = legacy.clean_text(" ".join(merged_text))
    if len(transcript.split()) < 20:
        raise RuntimeError("transcription_too_short")
    return {
        "transcript": transcript,
        "segments": merged_segments,
        "vtt": legacy.segments_to_vtt(merged_segments),
    }


def analyze_visual_profile_live(source: Path, media: dict[str, Any], job_id: str) -> dict[str, Any]:
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
            if ok and frame is not None:
                small = legacy.resize_for_analysis(frame)
                gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
                luminances.append(float(gray.mean()) / 255.0)
                contrasts.append(float(gray.std()) / 128.0)
                if previous_gray is not None and previous_gray.shape == gray.shape:
                    motions.append(float(cv2.absdiff(previous_gray, gray).mean()) / 255.0)
                previous_gray = gray
                faces = classifier.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=5, minSize=(28, 28))
                face_counts.append(len(faces))
            update_state(
                job_id,
                "processing",
                "visual_analysis",
                43 + round(((index + 1) / sample_count) * 8),
                activity=f"Analyse visuelle {index + 1}/{sample_count}",
                detail=f"Image prélevée à {format_duration(second)}.",
                metrics={"visualSamples": index + 1, "totalVisualSamples": sample_count},
            )
    finally:
        capture.release()
    luminance = legacy.mean(luminances, 0.5)
    contrast = min(1.0, legacy.mean(contrasts, 0.5))
    motion = min(1.0, legacy.mean(motions, 0.25) * 4)
    face_count = round(legacy.mean([float(value) for value in face_counts], 1.0))
    technical_quality = max(0.2, min(1.0, 0.45 + contrast * 0.28 + (1 - abs(luminance - 0.52)) * 0.22 - motion * 0.08))
    result = {
        "luminance": round(luminance, 4),
        "contrast": round(contrast, 4),
        "motion": round(motion, 4),
        "faceCount": int(face_count),
        "technicalQuality": round(technical_quality, 4),
        "sampleCount": len(luminances),
        "recommendedCaptionPreset": legacy.choose_caption_preset(luminance, contrast, motion),
    }
    update_state(
        job_id,
        "processing",
        "visual_analysis",
        51,
        activity="Analyse visuelle terminée",
        detail=f"Qualité technique estimée à {round(technical_quality * 100)} %.",
        metrics={"visualSamples": sample_count, "totalVisualSamples": sample_count, "faceCount": int(face_count)},
        event="Profil visuel établi",
    )
    return result


def render_clip_live(
    source: Path,
    output: Path,
    subtitles: Path,
    candidate: dict[str, Any],
    job_id: str,
    index: int,
    total: int,
    title: str,
) -> None:
    start = max(0.0, float(candidate.get("startSeconds") or 0))
    end = max(start + 0.2, float(candidate.get("endSeconds") or 0))
    duration = end - start
    subtitle_filter = legacy.escape_ffmpeg_path(subtitles)
    filter_complex = (
        "[0:v]split=2[bg][fg];"
        "[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=34[bgv];"
        "[fg]scale=1080:1920:force_original_aspect_ratio=decrease[fgv];"
        "[bgv][fgv]overlay=(W-w)/2:(H-h)/2,"
        f"ass='{subtitle_filter}'[v]"
    )
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-progress", "pipe:1", "-nostats",
        "-ss", f"{start:.3f}", "-i", str(source), "-t", f"{duration:.3f}",
        "-filter_complex", filter_complex, "-map", "[v]", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-profile:v", "high", "-level", "4.1",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart",
        "-y", str(output),
    ]
    base_progress = 60 + (index / max(1, total)) * 34
    span = 34 / max(1, total)

    def render_progress(seconds: float) -> None:
        ratio = min(1.0, max(0.0, seconds / max(0.1, duration)))
        progress = round(base_progress + ratio * span * 0.86)
        update_state(
            job_id,
            "processing",
            "rendering",
            progress,
            activity=f"Encodage du short {index + 1}/{total}",
            detail=f"{title} · {round(ratio * 100)} % du clip encodé.",
            stageProgress=round(ratio, 4),
            metrics={"renderedClipSeconds": round(seconds, 2), "currentClipDurationSeconds": round(duration, 2)},
        )

    run_ffmpeg_progress(command, timeout=max(600, int(duration * 20)), callback=render_progress)
    if not output.exists() or output.stat().st_size < 20_000:
        raise RuntimeError("rendered_clip_is_empty")


def run_ffmpeg_progress(command: list[str], timeout: int, callback: Callable[[float], None]) -> None:
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    lines: list[str] = []
    started = time.monotonic()
    try:
        if process.stdout is None:
            raise RuntimeError("ffmpeg_progress_unavailable")
        for raw in process.stdout:
            line = raw.strip()
            if line:
                lines.append(line)
                lines = lines[-80:]
            if line.startswith("out_time_ms="):
                try:
                    callback(max(0.0, float(line.split("=", 1)[1]) / 1_000_000))
                except ValueError:
                    pass
            if time.monotonic() - started > timeout:
                process.kill()
                raise subprocess.TimeoutExpired(command[0], timeout)
        return_code = process.wait(timeout=15)
    except Exception:
        if process.poll() is None:
            process.kill()
        raise
    if return_code != 0:
        raise RuntimeError(f"command_failed:ffmpeg:{' | '.join(lines[-20:])[-1200:]}")


def make_vertical_preview(path: Path, second: float) -> str:
    try:
        capture = cv2.VideoCapture(str(path))
        capture.set(cv2.CAP_PROP_POS_MSEC, max(0.0, second) * 1000)
        ok, frame = capture.read()
        capture.release()
        if not ok or frame is None:
            return ""
        target_width, target_height = 270, 480
        height, width = frame.shape[:2]
        background_scale = max(target_width / max(1, width), target_height / max(1, height))
        background = cv2.resize(frame, (max(1, round(width * background_scale)), max(1, round(height * background_scale))))
        x = max(0, (background.shape[1] - target_width) // 2)
        y = max(0, (background.shape[0] - target_height) // 2)
        background = background[y : y + target_height, x : x + target_width]
        background = cv2.GaussianBlur(background, (0, 0), 12)
        foreground_scale = min(target_width / max(1, width), target_height / max(1, height))
        foreground = cv2.resize(frame, (max(1, round(width * foreground_scale)), max(1, round(height * foreground_scale))))
        fx = max(0, (target_width - foreground.shape[1]) // 2)
        fy = max(0, (target_height - foreground.shape[0]) // 2)
        background[fy : fy + foreground.shape[0], fx : fx + foreground.shape[1]] = foreground
        encoded, data = cv2.imencode(".jpg", background, [int(cv2.IMWRITE_JPEG_QUALITY), 62])
        if not encoded:
            return ""
        payload = base64.b64encode(data.tobytes()).decode("ascii")
        return f"data:image/jpeg;base64,{payload}" if len(payload) < 220_000 else ""
    except Exception:  # noqa: BLE001
        return ""


def parse_iso_epoch(value: str) -> float:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return time.time()


def format_bytes(value: int | float) -> str:
    size = float(value or 0)
    units = ["o", "Ko", "Mo", "Go", "To"]
    index = 0
    while size >= 1024 and index < len(units) - 1:
        size /= 1024
        index += 1
    return f"{size:.1f} {units[index]}" if index else f"{round(size)} {units[index]}"


def format_duration(seconds: int | float) -> str:
    value = max(0, round(float(seconds or 0)))
    hours, remainder = divmod(value, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:d} h {minutes:02d} min" if hours else f"{minutes:d} min {secs:02d} s"


legacy.update_state = update_state
legacy.process_job = process_job
