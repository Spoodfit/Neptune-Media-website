from __future__ import annotations

import json
import os
import queue
import re
import shutil
import sqlite3
import subprocess
import threading
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import cv2
import httpx
import numpy as np
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from faster_whisper import WhisperModel

VERSION = "neptune-video-engine-20260802-v73"
ROOT = Path(os.getenv("NEPTUNE_ENGINE_DATA", "/data")).resolve()
JOBS_DIR = ROOT / "jobs"
DB_PATH = ROOT / "engine.sqlite3"
ENGINE_TOKEN = os.getenv("NEPTUNE_ENGINE_TOKEN", "").strip()
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small").strip() or "small"
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "auto").strip() or "auto"
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8").strip() or "int8"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-mini").strip() or "gpt-5-mini"
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://host.docker.internal:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b").strip() or "llama3.2:3b"
MAX_WORKERS = max(1, min(2, int(os.getenv("NEPTUNE_ENGINE_WORKERS", "1"))))
ALLOWED_ORIGINS = [
    item.strip()
    for item in os.getenv(
        "NEPTUNE_ALLOWED_ORIGINS",
        "https://tv.neptunebusiness.com,https://neptune-media-webtv.neptunebusinessclub.workers.dev,http://localhost:8787",
    ).split(",")
    if item.strip()
]

ROOT.mkdir(parents=True, exist_ok=True)
JOBS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Neptune Video Engine", version=VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Neptune-Engine-Token"],
)

job_queue: queue.Queue[str] = queue.Queue()
model_lock = threading.Lock()
model: WhisperModel | None = None
workers_started = False


def now() -> str:
    return datetime.now(UTC).isoformat()


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with connect() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
              id TEXT PRIMARY KEY,
              status TEXT NOT NULL,
              stage TEXT NOT NULL,
              progress INTEGER NOT NULL DEFAULT 0,
              source_name TEXT NOT NULL,
              source_path TEXT NOT NULL,
              metadata_json TEXT NOT NULL DEFAULT '{}',
              result_json TEXT NOT NULL DEFAULT '{}',
              error_code TEXT NOT NULL DEFAULT '',
              error_detail TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        db.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, updated_at)")
        db.commit()


def authorize(x_neptune_engine_token: str | None = Header(default=None)) -> None:
    if ENGINE_TOKEN and x_neptune_engine_token != ENGINE_TOKEN:
        raise HTTPException(status_code=401, detail="engine_token_invalid")


def row_to_job(row: sqlite3.Row) -> dict[str, Any]:
    data = dict(row)
    for key in ("metadata_json", "result_json"):
        try:
            data[key.removesuffix("_json")] = json.loads(data.pop(key) or "{}")
        except json.JSONDecodeError:
            data[key.removesuffix("_json")] = {}
    data["progress"] = int(data.get("progress") or 0)
    return data


def get_job(job_id: str) -> dict[str, Any]:
    with connect() as db:
        row = db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="job_not_found")
    return row_to_job(row)


def update_job(job_id: str, *, status: str | None = None, stage: str | None = None, progress: int | None = None,
               result: dict[str, Any] | None = None, error_code: str | None = None, error_detail: str | None = None) -> None:
    fields: list[str] = ["updated_at=?"]
    values: list[Any] = [now()]
    if status is not None:
        fields.append("status=?")
        values.append(status)
    if stage is not None:
        fields.append("stage=?")
        values.append(stage)
    if progress is not None:
        fields.append("progress=?")
        values.append(max(0, min(100, int(progress))))
    if result is not None:
        fields.append("result_json=?")
        values.append(json.dumps(result, ensure_ascii=False))
    if error_code is not None:
        fields.append("error_code=?")
        values.append(error_code[:120])
    if error_detail is not None:
        fields.append("error_detail=?")
        values.append(error_detail[:2000])
    values.append(job_id)
    with connect() as db:
        db.execute(f"UPDATE jobs SET {', '.join(fields)} WHERE id=?", values)
        db.commit()


def safe_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", Path(value).name).strip("-.")
    return cleaned[:180] or "source.mp4"


def run(command: list[str], timeout: int = 1800) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=True, capture_output=True, text=True, timeout=timeout)


@app.on_event("startup")
def startup() -> None:
    global workers_started
    init_db()
    if workers_started:
        return
    workers_started = True
    with connect() as db:
        rows = db.execute("SELECT id FROM jobs WHERE status IN ('queued','processing') ORDER BY created_at ASC").fetchall()
        db.execute("UPDATE jobs SET status='queued',stage='reprise',progress=MAX(progress,2),updated_at=? WHERE status='processing'", (now(),))
        db.commit()
    for row in rows:
        job_queue.put(str(row["id"]))
    for index in range(MAX_WORKERS):
        threading.Thread(target=worker_loop, daemon=True, name=f"neptune-video-worker-{index + 1}").start()


@app.get("/health")
def health(_: None = Depends(authorize)) -> dict[str, Any]:
    return {
        "ok": True,
        "version": VERSION,
        "mode": "persistent-local-service",
        "queueDepth": job_queue.qsize(),
        "whisperModel": WHISPER_MODEL,
        "openAiConfigured": bool(OPENAI_API_KEY),
        "ollamaConfigured": bool(OLLAMA_URL),
        "capabilities": ["persistent-queue", "faster-whisper", "ffmpeg", "opencv-smart-crop", "subtitles", "openai", "ollama"],
    }


@app.get("/v1/jobs")
def list_jobs(_: None = Depends(authorize)) -> dict[str, Any]:
    with connect() as db:
        rows = db.execute("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100").fetchall()
    return {"ok": True, "jobs": [row_to_job(row) for row in rows]}


@app.post("/v1/jobs", status_code=202)
def create_job(
    metadata: str = Form("{}"),
    file: UploadFile = File(...),
    _: None = Depends(authorize),
) -> dict[str, Any]:
    try:
        meta = json.loads(metadata or "{}")
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=400, detail="metadata_invalid") from error
    job_id = re.sub(r"[^A-Za-z0-9_-]+", "", str(meta.get("jobId") or uuid.uuid4().hex))[:100]
    if not job_id:
        raise HTTPException(status_code=400, detail="job_id_invalid")
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    source_name = safe_name(file.filename or "source.mp4")
    source_path = job_dir / source_name
    with source_path.open("wb") as output:
        while chunk := file.file.read(4 * 1024 * 1024):
            output.write(chunk)
    if source_path.stat().st_size < 1024:
        source_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="source_empty")
    created = now()
    with connect() as db:
        existing = db.execute("SELECT status FROM jobs WHERE id=?", (job_id,)).fetchone()
        if existing and existing["status"] in {"queued", "processing", "completed"}:
            return {"ok": True, "accepted": False, "deduplicated": True, "jobId": job_id}
        db.execute(
            """INSERT OR REPLACE INTO jobs
               (id,status,stage,progress,source_name,source_path,metadata_json,result_json,error_code,error_detail,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (job_id, "queued", "vidéo reçue", 2, source_name, str(source_path), json.dumps(meta, ensure_ascii=False), "{}", "", "", created, created),
        )
        db.commit()
    job_queue.put(job_id)
    return {"ok": True, "accepted": True, "jobId": job_id, "status": "queued", "progress": 2}


@app.get("/v1/jobs/{job_id}")
def job_status(job_id: str, _: None = Depends(authorize)) -> dict[str, Any]:
    return {"ok": True, "job": get_job(job_id)}


@app.post("/v1/jobs/{job_id}/retry", status_code=202)
def retry_job(job_id: str, _: None = Depends(authorize)) -> dict[str, Any]:
    job = get_job(job_id)
    if job["status"] in {"queued", "processing"}:
        return {"ok": True, "deduplicated": True, "jobId": job_id}
    if not Path(job["source_path"]).exists():
        raise HTTPException(status_code=409, detail="source_missing")
    update_job(job_id, status="queued", stage="reprise demandée", progress=2, error_code="", error_detail="")
    job_queue.put(job_id)
    return {"ok": True, "accepted": True, "jobId": job_id}


@app.delete("/v1/jobs/{job_id}")
def delete_job(job_id: str, _: None = Depends(authorize)) -> dict[str, Any]:
    job = get_job(job_id)
    if job["status"] == "processing":
        raise HTTPException(status_code=409, detail="job_processing")
    shutil.rmtree(JOBS_DIR / job_id, ignore_errors=True)
    with connect() as db:
        db.execute("DELETE FROM jobs WHERE id=?", (job_id,))
        db.commit()
    return {"ok": True}


@app.get("/v1/jobs/{job_id}/preview")
def preview(job_id: str, _: None = Depends(authorize)) -> FileResponse:
    path = JOBS_DIR / job_id / "preview.jpg"
    if not path.exists():
        raise HTTPException(status_code=404, detail="preview_not_ready")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@app.get("/v1/jobs/{job_id}/clips/{clip_id}")
def clip(job_id: str, clip_id: str, _: None = Depends(authorize)) -> FileResponse:
    safe_clip = re.sub(r"[^A-Za-z0-9_-]+", "", clip_id)[:100]
    path = JOBS_DIR / job_id / "clips" / f"{safe_clip}.mp4"
    if not path.exists():
        raise HTTPException(status_code=404, detail="clip_not_found")
    return FileResponse(path, media_type="video/mp4", filename=path.name, headers={"Cache-Control": "no-store"})


def worker_loop() -> None:
    while True:
        job_id = job_queue.get()
        try:
            process_job(job_id)
        except Exception as error:  # noqa: BLE001
            update_job(job_id, status="failed", stage="échec", error_code=classify_error(error), error_detail=f"{type(error).__name__}: {error}")
        finally:
            job_queue.task_done()


def process_job(job_id: str) -> None:
    job = get_job(job_id)
    source = Path(job["source_path"])
    job_dir = JOBS_DIR / job_id
    clips_dir = job_dir / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    update_job(job_id, status="processing", stage="ouverture de la vidéo", progress=5, error_code="", error_detail="")
    media = probe_media(source)
    make_preview(source, job_dir / "preview.jpg", media["durationSeconds"] * 0.12)

    update_job(job_id, stage="transcription de l’interview", progress=12)
    transcript = transcribe(source, job_dir, job_id)

    update_job(job_id, stage="repérage des personnes et des scènes", progress=45)
    visual = visual_profile(source, media)

    update_job(job_id, stage="sélection des meilleurs moments", progress=53)
    candidates, provider, ai_model = select_candidates(transcript, media, visual, job.get("metadata") or {})
    if not candidates:
        raise RuntimeError("no_candidate_above_minimum_score")

    outputs: list[dict[str, Any]] = []
    for index, candidate in enumerate(candidates):
        clip_id = candidate["id"]
        update_job(job_id, stage=f"création du short {index + 1} sur {len(candidates)}", progress=60 + round(index / len(candidates) * 34))
        output = clips_dir / f"{clip_id}.mp4"
        subtitles = job_dir / f"{clip_id}.ass"
        write_subtitles(subtitles, candidate["transcriptSegments"], candidate["startSeconds"], candidate["endSeconds"])
        render_clip(source, output, subtitles, candidate, media)
        candidate["outputSizeBytes"] = output.stat().st_size
        candidate["outputMimeType"] = "video/mp4"
        candidate["mediaPath"] = f"/v1/jobs/{job_id}/clips/{clip_id}"
        outputs.append(candidate)
        make_preview(output, job_dir / "preview.jpg", max(0.2, (candidate["endSeconds"] - candidate["startSeconds"]) * 0.2))

    result = {
        "jobId": job_id,
        "transcript": transcript["text"],
        "transcriptVtt": transcript["vtt"],
        "durationSeconds": media["durationSeconds"],
        "width": media["width"],
        "height": media["height"],
        "media": media,
        "visualProfile": visual,
        "candidates": outputs,
        "generationStatus": provider,
        "aiModel": ai_model,
        "promptVersion": VERSION,
    }
    update_job(job_id, status="completed", stage="shorts prêts à valider", progress=100, result=result)


def probe_media(source: Path) -> dict[str, Any]:
    completed = run([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration:stream=codec_type,width,height,codec_name,r_frame_rate",
        "-of", "json", str(source),
    ], timeout=120)
    data = json.loads(completed.stdout or "{}")
    streams = data.get("streams") or []
    video = next((item for item in streams if item.get("codec_type") == "video"), None)
    audio = next((item for item in streams if item.get("codec_type") == "audio"), {})
    duration = float((data.get("format") or {}).get("duration") or 0)
    if not video or duration <= 0:
        raise RuntimeError("invalid_video_source")
    return {
        "durationSeconds": round(duration, 3),
        "width": int(video.get("width") or 0),
        "height": int(video.get("height") or 0),
        "videoCodec": str(video.get("codec_name") or ""),
        "audioCodec": str(audio.get("codec_name") or ""),
    }


def get_model() -> WhisperModel:
    global model
    with model_lock:
        if model is None:
            model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE_TYPE)
        return model


def transcribe(source: Path, job_dir: Path, job_id: str) -> dict[str, Any]:
    audio = job_dir / "audio.wav"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(source), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-y", str(audio)], timeout=3600)
    whisper = get_model()
    segments_iter, info = whisper.transcribe(str(audio), vad_filter=True, word_timestamps=True, beam_size=3)
    segments: list[dict[str, Any]] = []
    text_parts: list[str] = []
    for segment in segments_iter:
        text = clean_text(segment.text)
        if not text:
            continue
        segments.append({"start": round(float(segment.start), 3), "end": round(float(segment.end), 3), "text": text})
        text_parts.append(text)
        progress = 14 + round(min(1.0, float(segment.end) / max(1.0, float(info.duration))) * 28)
        update_job(job_id, stage="transcription de l’interview", progress=progress)
    transcript = clean_text(" ".join(text_parts))
    if len(transcript.split()) < 20:
        raise RuntimeError("transcription_too_short")
    return {"text": transcript, "segments": segments, "vtt": to_vtt(segments)}


def visual_profile(source: Path, media: dict[str, Any]) -> dict[str, Any]:
    capture = cv2.VideoCapture(str(source))
    classifier = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    duration = float(media["durationSeconds"])
    samples = max(8, min(36, round(duration / 60)))
    face_centers: list[float] = []
    luminance: list[float] = []
    contrast: list[float] = []
    try:
        for index in range(samples):
            capture.set(cv2.CAP_PROP_POS_MSEC, duration * (index + 0.5) / samples * 1000)
            ok, frame = capture.read()
            if not ok or frame is None:
                continue
            scale = min(1.0, 720 / max(frame.shape[:2]))
            small = cv2.resize(frame, None, fx=scale, fy=scale) if scale < 1 else frame
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            luminance.append(float(gray.mean()) / 255)
            contrast.append(min(1.0, float(gray.std()) / 100))
            faces = classifier.detectMultiScale(gray, 1.12, 5, minSize=(30, 30))
            if len(faces):
                x, _, w, _ = max(faces, key=lambda item: item[2] * item[3])
                face_centers.append((x + w / 2) / small.shape[1])
    finally:
        capture.release()
    return {
        "luminance": round(float(np.mean(luminance)) if luminance else 0.5, 4),
        "contrast": round(float(np.mean(contrast)) if contrast else 0.5, 4),
        "faceCenterX": round(float(np.median(face_centers)) if face_centers else 0.5, 4),
        "faceDetected": bool(face_centers),
        "sampleCount": len(luminance),
        "recommendedCaptionPreset": "neptune-premium",
    }


def select_candidates(transcript: dict[str, Any], media: dict[str, Any], visual: dict[str, Any], metadata: dict[str, Any]) -> tuple[list[dict[str, Any]], str, str]:
    if OPENAI_API_KEY:
        try:
            return openai_candidates(transcript, media, metadata), "local-agent-openai", OPENAI_MODEL
        except Exception as error:  # noqa: BLE001
            print(f"openai_selection_failed:{type(error).__name__}:{str(error)[:300]}", flush=True)
    if OLLAMA_URL:
        try:
            return ollama_candidates(transcript, media, metadata), "local-agent-ollama", OLLAMA_MODEL
        except Exception as error:  # noqa: BLE001
            print(f"ollama_selection_failed:{type(error).__name__}:{str(error)[:300]}", flush=True)
    return heuristic_candidates(transcript, media), "local-agent-rules", "neptune-local-rules-v2"


def openai_candidates(transcript: dict[str, Any], media: dict[str, Any], metadata: dict[str, Any]) -> list[dict[str, Any]]:
    prompt = selection_prompt(transcript, media, metadata)
    schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {"candidates": {"type": "array", "minItems": 1, "maxItems": 12, "items": {
            "type": "object", "additionalProperties": False,
            "properties": {
                "startSeconds": {"type": "number"}, "endSeconds": {"type": "number"},
                "title": {"type": "string"}, "funnel": {"type": "string", "enum": ["TOFU", "MOFU", "BOFU"]},
                "score": {"type": "integer", "minimum": 60, "maximum": 100},
                "hook": {"type": "string"}, "rationale": {"type": "string"},
            },
            "required": ["startSeconds", "endSeconds", "title", "funnel", "score", "hook", "rationale"],
        }}},
        "required": ["candidates"],
    }
    response = httpx.post(
        "https://api.openai.com/v1/responses",
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
        json={
            "model": OPENAI_MODEL,
            "store": False,
            "input": [{"role": "user", "content": [{"type": "input_text", "text": prompt}]}],
            "text": {"format": {"type": "json_schema", "name": "neptune_video_candidates", "strict": True, "schema": schema}},
        },
        timeout=httpx.Timeout(60, read=900),
    )
    response.raise_for_status()
    data = response.json()
    raw = data.get("output_text") or extract_response_text(data)
    return normalize_candidates(json.loads(raw).get("candidates") or [], transcript["segments"], media["durationSeconds"])


def ollama_candidates(transcript: dict[str, Any], media: dict[str, Any], metadata: dict[str, Any]) -> list[dict[str, Any]]:
    response = httpx.post(
        f"{OLLAMA_URL}/api/chat",
        json={
            "model": OLLAMA_MODEL,
            "stream": False,
            "format": "json",
            "messages": [{"role": "user", "content": selection_prompt(transcript, media, metadata)}],
        },
        timeout=httpx.Timeout(20, read=900),
    )
    response.raise_for_status()
    content = ((response.json().get("message") or {}).get("content") or "{}")
    return normalize_candidates(json.loads(content).get("candidates") or [], transcript["segments"], media["durationSeconds"])


def selection_prompt(transcript: dict[str, Any], media: dict[str, Any], metadata: dict[str, Any]) -> str:
    segments = "\n".join(f"[{item['start']:.1f}-{item['end']:.1f}] {item['text']}" for item in transcript["segments"][:5000])
    return f"""Tu es le monteur éditorial Neptune Media. Sélectionne 4 à 12 passages autonomes de 20 à 75 secondes, sans doublons, avec un début immédiatement compréhensible et une fin complète. Répartis TOFU, MOFU et BOFU. Ne retiens que les passages notés au moins 60/100. Retourne uniquement un objet JSON avec candidates. Chaque candidate contient startSeconds, endSeconds, title, funnel, score, hook et rationale.\nObjectif: {metadata.get('objective', '')}\nClient: {metadata.get('company', '')}\nDurée: {media['durationSeconds']} secondes\nTRANSCRIPTION HORODATÉE:\n{segments}"""


def heuristic_candidates(transcript: dict[str, Any], media: dict[str, Any]) -> list[dict[str, Any]]:
    segments = transcript["segments"]
    windows: list[dict[str, Any]] = []
    for start_index in range(0, len(segments), 2):
        start = float(segments[start_index]["start"])
        selected: list[dict[str, Any]] = []
        for item in segments[start_index:]:
            if float(item["end"]) - start > 70:
                break
            selected.append(item)
            duration = float(item["end"]) - start
            if duration >= 24:
                text = clean_text(" ".join(part["text"] for part in selected))
                score = 60 + min(24, len(text.split()) // 10)
                score += 5 if re.search(r"\b(pourquoi|comment|erreur|secret|problème|solution|jamais|toujours|client|argent|temps)\b", text, re.I) else 0
                windows.append({"startSeconds": start, "endSeconds": float(item["end"]), "title": text[:72], "funnel": ["TOFU", "MOFU", "BOFU"][len(windows) % 3], "score": min(88, score), "hook": text.split(". ")[0][:180], "rationale": "Passage autonome avec densité éditoriale suffisante."})
                break
    windows.sort(key=lambda item: item["score"], reverse=True)
    chosen: list[dict[str, Any]] = []
    for item in windows:
        if all(abs(item["startSeconds"] - other["startSeconds"]) > 30 for other in chosen):
            chosen.append(item)
        if len(chosen) >= 8:
            break
    return normalize_candidates(chosen, segments, media["durationSeconds"])


def normalize_candidates(raw: list[Any], segments: list[dict[str, Any]], duration: float) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for index, item in enumerate(raw[:16]):
        if not isinstance(item, dict):
            continue
        start = max(0.0, min(duration - 1, float(item.get("startSeconds") or 0)))
        end = max(start + 10, min(duration, float(item.get("endSeconds") or start + 45)))
        if end - start > 90:
            end = start + 90
        score = max(60, min(100, int(item.get("score") or 60)))
        clip_segments = [segment for segment in segments if float(segment["end"]) > start and float(segment["start"]) < end]
        if not clip_segments:
            continue
        clip_id = f"clip-{index + 1:02d}-{uuid.uuid4().hex[:8]}"
        title = clean_text(item.get("title") or clip_segments[0]["text"])[:120]
        hook = clean_text(item.get("hook") or clip_segments[0]["text"])[:220]
        funnel = str(item.get("funnel") or "MOFU").upper()
        if funnel not in {"TOFU", "MOFU", "BOFU"}:
            funnel = "MOFU"
        output.append({
            "id": clip_id,
            "startSeconds": round(start, 3), "endSeconds": round(end, 3),
            "title": title, "funnel": funnel, "score": score,
            "scoreBreakdown": {"hook": min(20, score // 5), "autonomy": 14, "value": 14, "retention": 12, "emotion": 8, "originality": 8, "marketing": 8, "technical": 6},
            "rationale": clean_text(item.get("rationale") or "Passage autonome et exploitable.")[:500],
            "hookMoment": hook, "captionPreset": "neptune-premium",
            "transcriptSegments": clip_segments,
            "editorialProposals": editorial_proposals(title, hook, funnel),
        })
    return output


def editorial_proposals(title: str, hook: str, funnel: str) -> list[dict[str, Any]]:
    return [
        {"id": "direct", "label": "Directe", "hook": hook, "description": title, "cta": "Quel est votre avis ?", "hashtags": ["#Business", "#Communication", "#NeptuneMedia"], "fullPost": f"{hook}\n\n{title}"},
        {"id": "expertise", "label": "Expertise", "hook": title, "description": hook, "cta": "À appliquer dans votre entreprise.", "hashtags": ["#Expertise", f"#{funnel}", "#NeptuneMedia"], "fullPost": f"{title}\n\n{hook}"},
        {"id": "conversation", "label": "Conversationnelle", "hook": f"Et si {title.lower()} ?", "description": hook, "cta": "Vous l’avez déjà constaté ?", "hashtags": ["#Entrepreneuriat", "#Marketing", "#NeptuneMedia"], "fullPost": f"Et si {title.lower()} ?\n\n{hook}"},
    ]


def render_clip(source: Path, output: Path, subtitles: Path, candidate: dict[str, Any], media: dict[str, Any]) -> None:
    start = float(candidate["startSeconds"])
    clip_duration = float(candidate["endSeconds"]) - start
    width, height = int(media["width"]), int(media["height"])
    crop_width = min(width, round(height * 9 / 16)) if width > height else width
    center = 0.5
    x = max(0, min(width - crop_width, round(center * width - crop_width / 2)))
    subtitle_path = str(subtitles).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
    if width > height and crop_width < width:
        video_filter = f"crop={crop_width}:{height}:{x}:0,scale=1080:1920,ass='{subtitle_path}'"
    else:
        video_filter = f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,ass='{subtitle_path}'"
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", f"{start:.3f}", "-i", str(source), "-t", f"{clip_duration:.3f}",
        "-vf", video_filter, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-y", str(output),
    ], timeout=max(900, round(clip_duration * 25)))
    if not output.exists() or output.stat().st_size < 20_000:
        raise RuntimeError("rendered_clip_empty")


def write_subtitles(path: Path, segments: list[dict[str, Any]], clip_start: float, clip_end: float) -> None:
    header = """[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Neptune,DejaVu Sans,62,&H00FFFFFF,&H00DFA3FF,&HCC06183F,&H33000000,1,0,0,0,100,100,0,0,1,4,1,2,70,70,230,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"""
    events: list[str] = []
    for segment in segments:
        start = max(0.0, float(segment["start"]) - clip_start)
        end = min(clip_end - clip_start, float(segment["end"]) - clip_start)
        if end <= start:
            continue
        text = clean_text(segment["text"]).replace("{", "(").replace("}", ")")
        events.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Neptune,,0,0,0,,{text}")
    path.write_text(header + "\n".join(events) + "\n", encoding="utf-8")


def make_preview(source: Path, output: Path, second: float) -> None:
    try:
        run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", f"{max(0, second):.3f}", "-i", str(source), "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "3", "-y", str(output)], timeout=120)
    except Exception:  # noqa: BLE001
        pass


def to_vtt(segments: list[dict[str, Any]]) -> str:
    lines = ["WEBVTT", ""]
    for index, item in enumerate(segments, 1):
        lines.extend([str(index), f"{vtt_time(item['start'])} --> {vtt_time(item['end'])}", item["text"], ""])
    return "\n".join(lines)


def vtt_time(value: float) -> str:
    milliseconds = max(0, round(float(value) * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{milliseconds:03d}"


def ass_time(value: float) -> str:
    centiseconds = max(0, round(float(value) * 100))
    hours, remainder = divmod(centiseconds, 360_000)
    minutes, remainder = divmod(remainder, 6_000)
    seconds, centiseconds = divmod(remainder, 100)
    return f"{hours}:{minutes:02d}:{seconds:02d}.{centiseconds:02d}"


def extract_response_text(data: dict[str, Any]) -> str:
    parts: list[str] = []
    for output in data.get("output") or []:
        for content in output.get("content") or []:
            if content.get("type") in {"output_text", "text"} and content.get("text"):
                parts.append(str(content["text"]))
    if not parts:
        raise RuntimeError("openai_output_missing")
    return "".join(parts)


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def classify_error(error: Exception) -> str:
    text = str(error).lower()
    if "transcri" in text or "whisper" in text:
        return "transcription_failed"
    if "ffmpeg" in text or "render" in text:
        return "render_failed"
    if "memory" in text or "alloc" in text:
        return "memory_limit"
    if "no_candidate" in text:
        return "no_candidate_above_minimum_score"
    return "video_engine_failed"
