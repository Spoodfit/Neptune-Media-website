from __future__ import annotations

import json
import math
import os
import re
from pathlib import Path
from typing import Any

from fastapi import Request

import app as core

VERSION = "neptune-video-engine-20260803-v74"
core.VERSION = VERSION
app = core.app
TEST_MODE = os.getenv("NEPTUNE_ENGINE_TEST_MODE", "").strip() == "1"
MIN_SCORE = max(60, min(85, int(os.getenv("NEPTUNE_MIN_EDITORIAL_SCORE", "65"))))
MIN_PER_HOUR = max(10, int(os.getenv("NEPTUNE_MIN_CLIPS_PER_HOUR", "16")))
TARGET_PER_HOUR = max(MIN_PER_HOUR, int(os.getenv("NEPTUNE_TARGET_CLIPS_PER_HOUR", "20")))
MAX_PER_HOUR = max(TARGET_PER_HOUR, int(os.getenv("NEPTUNE_MAX_CLIPS_PER_HOUR", "24")))
_original_select_candidates = core.select_candidates


@app.middleware("http")
async def local_network_access_headers(request: Request, call_next):
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    response.headers["X-Neptune-Video-Engine"] = VERSION
    response.headers["Cache-Control"] = "no-store"
    return response


def build_face_classifier():
    classifier_type = getattr(core.cv2, "CascadeClassifier", None)
    cascade_root = getattr(getattr(core.cv2, "data", None), "haarcascades", "")
    if not callable(classifier_type) or not cascade_root:
        return None
    try:
        classifier = classifier_type(cascade_root + "haarcascade_frontalface_default.xml")
        return None if getattr(classifier, "empty", lambda: True)() else classifier
    except Exception:
        return None


def detect_faces(classifier, gray) -> list[tuple[int, int, int, int]]:
    if classifier is None:
        return []
    try:
        detected = classifier.detectMultiScale(gray, 1.10, 4, minSize=(34, 34))
        return [tuple(map(int, face)) for face in detected]
    except Exception:
        return []


def resize_for_detection(frame):
    height, width = frame.shape[:2]
    scale = min(1.0, 800 / max(height, width))
    return frame if scale >= 1 else core.cv2.resize(frame, None, fx=scale, fy=scale)


def read_frame(capture, second: float):
    capture.set(core.cv2.CAP_PROP_POS_MSEC, max(0.0, second) * 1000)
    ok, frame = capture.read()
    return frame if ok and frame is not None else None


def visual_profile(source: Path, media: dict[str, Any]) -> dict[str, Any]:
    capture_type = getattr(core.cv2, "VideoCapture", None)
    if not callable(capture_type):
        return {
            "luminance": 0.5,
            "contrast": 0.5,
            "faceCenterX": 0.5,
            "faceDetected": False,
            "faceDetector": "unavailable",
            "sampleCount": 0,
            "recommendedCaptionPreset": "neptune-vertical-safe-v2",
        }
    capture = capture_type(str(source))
    classifier = build_face_classifier()
    duration = float(media["durationSeconds"])
    samples = max(12, min(72, round(duration / 45)))
    centers: list[float] = []
    luminance: list[float] = []
    contrast: list[float] = []
    try:
        for index in range(samples):
            frame = read_frame(capture, duration * (index + 0.5) / samples)
            if frame is None:
                continue
            small = resize_for_detection(frame)
            gray = core.cv2.cvtColor(small, core.cv2.COLOR_BGR2GRAY)
            luminance.append(float(gray.mean()) / 255)
            contrast.append(min(1.0, float(gray.std()) / 100))
            faces = detect_faces(classifier, gray)
            if faces:
                x, _, width, _ = max(faces, key=lambda item: item[2] * item[3])
                centers.append((x + width / 2) / small.shape[1])
    finally:
        capture.release()
    return {
        "luminance": round(float(core.np.mean(luminance)) if luminance else 0.5, 4),
        "contrast": round(float(core.np.mean(contrast)) if contrast else 0.5, 4),
        "faceCenterX": round(float(core.np.median(centers)) if centers else 0.5, 4),
        "faceDetected": bool(centers),
        "faceDetector": "opencv-active-speaker-v2" if classifier is not None else "center-fallback",
        "sampleCount": len(luminance),
        "recommendedCaptionPreset": "neptune-vertical-safe-v2",
    }


def synthetic_words(text: str, start: float, end: float) -> list[dict[str, Any]]:
    tokens = [token for token in re.split(r"\s+", core.clean_text(text)) if token]
    if not tokens:
        return []
    duration = max(0.4, end - start)
    step = duration / len(tokens)
    return [
        {
            "start": round(start + index * step, 3),
            "end": round(start + (index + 1) * step, 3),
            "text": token,
        }
        for index, token in enumerate(tokens)
    ]


def transcribe(source: Path, job_dir: Path, job_id: str) -> dict[str, Any]:
    audio = job_dir / "audio.wav"
    core.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(source),
        "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-y", str(audio),
    ], timeout=3600)
    whisper = core.get_model()
    segments_iter, info = whisper.transcribe(
        str(audio),
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 350},
        word_timestamps=True,
        beam_size=5,
        condition_on_previous_text=True,
    )
    segments: list[dict[str, Any]] = []
    all_words: list[dict[str, Any]] = []
    text_parts: list[str] = []
    duration = max(1.0, float(getattr(info, "duration", 0) or 0))
    for segment in segments_iter:
        text = core.clean_text(segment.text)
        if not text:
            continue
        words: list[dict[str, Any]] = []
        for word in getattr(segment, "words", None) or []:
            value = core.clean_text(getattr(word, "word", ""))
            start = getattr(word, "start", None)
            end = getattr(word, "end", None)
            if not value or start is None or end is None:
                continue
            entry = {"start": round(float(start), 3), "end": round(float(end), 3), "text": value}
            words.append(entry)
            all_words.append(entry)
        segments.append({
            "start": round(float(segment.start), 3),
            "end": round(float(segment.end), 3),
            "text": text,
            "words": words,
        })
        text_parts.append(text)
        progress = 14 + round(min(1.0, float(segment.end) / duration) * 28)
        core.update_job(job_id, stage="compréhension mot à mot de l’interview", progress=progress)
    transcript = core.clean_text(" ".join(text_parts))
    if len(transcript.split()) < 20:
        raise RuntimeError("transcription_too_short")
    return {"text": transcript, "segments": segments, "words": all_words, "vtt": core.to_vtt(segments)}


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
    segments = []
    words = []
    for index, phrase in enumerate(phrases):
        start = round(index * segment_duration, 3)
        end = round(min(duration, (index + 1) * segment_duration), 3)
        segment_words = synthetic_words(phrase, start, end)
        words.extend(segment_words)
        segments.append({"start": start, "end": end, "text": phrase, "words": segment_words})
    core.update_job(job_id, stage="transcription de test", progress=42)
    return {"text": " ".join(phrases), "segments": segments, "words": words, "vtt": core.to_vtt(segments)}


def target_clip_counts(duration_seconds: float) -> tuple[int, int, int]:
    hours = max(0.25, duration_seconds / 3600)
    minimum = max(4, math.ceil(hours * MIN_PER_HOUR))
    target = max(minimum, math.ceil(hours * TARGET_PER_HOUR))
    maximum = max(target, math.ceil(hours * MAX_PER_HOUR))
    return min(minimum, 28), min(target, 32), min(maximum, 36)


def chunk_transcript(segments: list[dict[str, Any]], duration: float) -> list[list[dict[str, Any]]]:
    chunks: list[list[dict[str, Any]]] = []
    start = 0.0
    window = 8 * 60
    overlap = 35
    while start < duration:
        end = min(duration, start + window)
        selected = [item for item in segments if float(item["end"]) > start and float(item["start"]) < end]
        if selected:
            chunks.append(selected)
        if end >= duration:
            break
        start = max(start + 1, end - overlap)
    return chunks


def openai_candidates(transcript: dict[str, Any], media: dict[str, Any], metadata: dict[str, Any]) -> list[dict[str, Any]]:
    duration = float(media["durationSeconds"])
    chunks = chunk_transcript(transcript["segments"], duration)
    raw_candidates: list[dict[str, Any]] = []
    for chunk_index, chunk in enumerate(chunks):
        chunk_start = float(chunk[0]["start"])
        chunk_end = float(chunk[-1]["end"])
        transcript_text = "\n".join(
            f"[{float(item['start']):.2f}-{float(item['end']):.2f}] {item['text']}" for item in chunk
        )
        prompt = f"""Tu es le directeur de montage de Neptune Media.
Analyse uniquement cette tranche d'interview et propose entre 2 et 5 shorts réellement autonomes.
Chaque short commence par une phrase forte déjà prononcée, développe une seule idée et finit sur une conclusion complète.
Cherche les révélations, erreurs coûteuses, croyances, histoires concrètes, méthodes, désaccords, chiffres, transformations et phrases mémorables.
Évite les présentations, transitions, politesses, répétitions et passages génériques.
Indique le sous-passage exact qui constitue l'accroche orale.
Durée souhaitée: 18 à 65 secondes. Score minimum: {MIN_SCORE}/100.
Répartis TOFU, MOFU et BOFU selon le contenu.
Objectif client: {metadata.get('objective', '')}
Entreprise: {metadata.get('company', '')}
Tranche {chunk_index + 1}/{len(chunks)}: {chunk_start:.2f} à {chunk_end:.2f} secondes.
Retourne uniquement le JSON conforme.
TRANSCRIPTION HORODATÉE:
{transcript_text}"""
        schema = {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "candidates": {
                    "type": "array",
                    "minItems": 0,
                    "maxItems": 6,
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "startSeconds": {"type": "number"},
                            "endSeconds": {"type": "number"},
                            "hookStartSeconds": {"type": "number"},
                            "hookEndSeconds": {"type": "number"},
                            "title": {"type": "string"},
                            "funnel": {"type": "string", "enum": ["TOFU", "MOFU", "BOFU"]},
                            "score": {"type": "integer", "minimum": MIN_SCORE, "maximum": 100},
                            "hook": {"type": "string"},
                            "rationale": {"type": "string"},
                        },
                        "required": [
                            "startSeconds", "endSeconds", "hookStartSeconds", "hookEndSeconds",
                            "title", "funnel", "score", "hook", "rationale",
                        ],
                    },
                },
            },
            "required": ["candidates"],
        }
        response = core.httpx.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {core.OPENAI_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": core.OPENAI_MODEL,
                "store": False,
                "input": [{"role": "user", "content": [{"type": "input_text", "text": prompt}]}],
                "text": {"format": {
                    "type": "json_schema", "name": "neptune_video_candidates_v74",
                    "strict": True, "schema": schema,
                }},
            },
            timeout=core.httpx.Timeout(60, read=900),
        )
        response.raise_for_status()
        data = response.json()
        raw = data.get("output_text") or core.extract_response_text(data)
        decoded = json.loads(raw)
        raw_candidates.extend(item for item in decoded.get("candidates") or [] if isinstance(item, dict))
    return raw_candidates


def infer_funnel(text: str) -> str:
    lowered = text.lower()
    if re.search(r"\b(prix|offre|accompagnement|résultat|client|réserver|choisir|décision)\b", lowered):
        return "BOFU"
    if re.search(r"\b(méthode|étape|comment|solution|conseil|appliquer|système)\b", lowered):
        return "MOFU"
    return "TOFU"


def concise_title(text: str) -> str:
    sentence = re.split(r"(?<=[.!?])\s+", core.clean_text(text))[0]
    words = sentence.split()
    return " ".join(words[:12])[:100].rstrip(" ,;:-")


def editorial_score(text: str, duration: float) -> int:
    lowered = text.lower()
    score = 55 + min(12, len(text.split()) // 12)
    for pattern, points in {
        r"\b(pourquoi|comment|voici|le problème|l'erreur|la vérité|le secret)\b": 6,
        r"\b(jamais|toujours|personne|tout le monde|grave|cher|risque|bloque)\b": 5,
        r"\b(\d+|euros?|jours?|mois|ans|pourcent|%)\b": 6,
        r"\b(j'ai|nous avons|un client|je me souviens|un jour|la première fois)\b": 5,
        r"\b(donc|voilà pourquoi|ce qui change|la solution|la méthode|il faut)\b": 4,
    }.items():
        if re.search(pattern, lowered, re.I):
            score += points
    if text.rstrip().endswith((".", "!", "?")):
        score += 3
    if 20 <= duration <= 55:
        score += 4
    return max(MIN_SCORE, min(92, score))


def heuristic_candidates(transcript: dict[str, Any], media: dict[str, Any]) -> list[dict[str, Any]]:
    segments = transcript["segments"]
    _, target, maximum = target_clip_counts(float(media["durationSeconds"]))
    windows: list[dict[str, Any]] = []
    for start_index, first in enumerate(segments):
        start = float(first["start"])
        selected: list[dict[str, Any]] = []
        for item in segments[start_index:]:
            current_end = float(item["end"])
            if current_end - start > 68:
                break
            selected.append(item)
            window_duration = current_end - start
            if window_duration < 18:
                continue
            text = core.clean_text(" ".join(part["text"] for part in selected))
            first_sentence = re.split(r"(?<=[.!?])\s+", text)[0]
            windows.append({
                "startSeconds": start,
                "endSeconds": current_end,
                "hookStartSeconds": start,
                "hookEndSeconds": min(current_end, start + 5),
                "title": concise_title(text),
                "funnel": infer_funnel(text),
                "score": editorial_score(text, window_duration),
                "hook": first_sentence[:180],
                "rationale": "Passage autonome détecté par densité, complétude et potentiel de rétention.",
            })
            if window_duration >= 36 or text.rstrip().endswith((".", "!", "?")):
                break
    windows.sort(key=lambda item: (-int(item["score"]), float(item["startSeconds"])))
    chosen: list[dict[str, Any]] = []
    for item in windows:
        if any(overlap_ratio(item, other) > 0.42 for other in chosen):
            continue
        chosen.append(item)
        if len(chosen) >= maximum:
            break
    if len(chosen) < target:
        for item in sorted(windows, key=lambda candidate: float(candidate["startSeconds"])):
            if item in chosen or any(overlap_ratio(item, other) > 0.62 for other in chosen):
                continue
            chosen.append(item)
            if len(chosen) >= target:
                break
    return chosen


def overlap_ratio(a: dict[str, Any], b: dict[str, Any]) -> float:
    a_start, a_end = float(a["startSeconds"]), float(a["endSeconds"])
    b_start, b_end = float(b["startSeconds"]), float(b["endSeconds"])
    intersection = max(0.0, min(a_end, b_end) - max(a_start, b_start))
    return intersection / max(1.0, min(a_end - a_start, b_end - b_start))


def text_similarity(a: str, b: str) -> float:
    left = {token for token in re.findall(r"\w+", a.lower()) if len(token) > 3}
    right = {token for token in re.findall(r"\w+", b.lower()) if len(token) > 3}
    return 0.0 if not left or not right else len(left & right) / len(left | right)


def align_candidate(item: dict[str, Any], segments: list[dict[str, Any]], duration: float, index: int):
    start = max(0.0, min(duration - 1, float(item.get("startSeconds") or 0)))
    end = max(start + 12, min(duration, float(item.get("endSeconds") or start + 40)))
    end = min(end, start + 75)
    matching = [segment for segment in segments if float(segment["end"]) > start and float(segment["start"]) < end]
    if not matching:
        return None
    start = max(0.0, float(matching[0]["start"]) - 0.10)
    end = min(duration, float(matching[-1]["end"]) + 0.18)
    if end - start > 75:
        end = start + 75
        matching = [segment for segment in matching if float(segment["start"]) < end]
    hook_start = max(start, min(end - 0.5, float(item.get("hookStartSeconds") or start)))
    hook_end = max(hook_start + 0.5, min(end, float(item.get("hookEndSeconds") or hook_start + 4)))
    if hook_start - start <= 4.5:
        start = max(0.0, hook_start - 0.18)
        matching = [segment for segment in segments if float(segment["end"]) > start and float(segment["start"]) < end]
    text = core.clean_text(" ".join(segment["text"] for segment in matching))
    score = max(MIN_SCORE, min(100, int(item.get("score") or editorial_score(text, end - start))))
    title = core.clean_text(item.get("title") or concise_title(text))[:120]
    hook = core.clean_text(item.get("hook") or matching[0]["text"])[:220]
    funnel = str(item.get("funnel") or infer_funnel(text)).upper()
    if funnel not in {"TOFU", "MOFU", "BOFU"}:
        funnel = "MOFU"
    return {
        "id": f"clip-{index + 1:02d}-{core.uuid.uuid4().hex[:8]}",
        "startSeconds": round(start, 3),
        "endSeconds": round(end, 3),
        "hookStartSeconds": round(hook_start, 3),
        "hookEndSeconds": round(hook_end, 3),
        "title": title,
        "funnel": funnel,
        "score": score,
        "scoreBreakdown": {
            "hook": min(20, round(score * 0.20)), "autonomy": min(16, round(score * 0.16)),
            "value": min(16, round(score * 0.16)), "retention": min(14, round(score * 0.14)),
            "emotion": min(10, round(score * 0.10)), "originality": min(10, round(score * 0.10)),
            "marketing": min(8, round(score * 0.08)), "technical": min(6, round(score * 0.06)),
        },
        "rationale": core.clean_text(item.get("rationale") or "Passage autonome, dense et exploitable.")[:500],
        "hookMoment": hook,
        "captionPreset": "neptune-vertical-safe-v2",
        "transcriptSegments": matching,
        "editorialProposals": core.editorial_proposals(title, hook, funnel),
        "montageMode": "active-speaker-jump-cut-v2",
    }


def merge_candidates(raw: list[dict[str, Any]], transcript: dict[str, Any], media: dict[str, Any]):
    duration = float(media["durationSeconds"])
    _, target, maximum = target_clip_counts(duration)
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(raw):
        candidate = align_candidate(item, transcript["segments"], duration, index) if isinstance(item, dict) else None
        if candidate is None or candidate["score"] < MIN_SCORE:
            continue
        if any(
            overlap_ratio(candidate, existing) > 0.52
            or (text_similarity(candidate["hookMoment"], existing["hookMoment"]) > 0.70
                and abs(candidate["startSeconds"] - existing["startSeconds"]) < 150)
            for existing in normalized
        ):
            continue
        normalized.append(candidate)
    normalized.sort(key=lambda item: (-int(item["score"]), float(item["startSeconds"])))
    selected: list[dict[str, Any]] = []
    buckets: dict[int, list[dict[str, Any]]] = {}
    for candidate in normalized:
        buckets.setdefault(int(candidate["startSeconds"] // 300), []).append(candidate)
    for bucket in sorted(buckets):
        selected.extend(buckets[bucket][:2])
    for candidate in normalized:
        if len(selected) >= target:
            break
        if candidate not in selected:
            selected.append(candidate)
    selected.sort(key=lambda item: float(item["startSeconds"]))
    return selected[:maximum]


def select_candidates(transcript: dict[str, Any], media: dict[str, Any], visual: dict[str, Any], metadata: dict[str, Any]):
    duration = float(media["durationSeconds"])
    raw: list[dict[str, Any]] = []
    provider = "local-agent-rules-v74"
    model_name = "neptune-editorial-density-v4"
    if TEST_MODE:
        raw = [{
            "startSeconds": 0, "endSeconds": max(10, min(duration, 12)),
            "hookStartSeconds": 0, "hookEndSeconds": min(duration, 4),
            "title": "Pourquoi une entreprise sérieuse reste invisible", "funnel": "MOFU",
            "score": 82, "hook": "Votre entreprise est sérieuse, mais est-ce que cela se voit ?",
            "rationale": "Validation intégrale du pipeline Neptune.",
        }]
        provider, model_name = "ci-deterministic", "neptune-ci-v2"
    elif core.OPENAI_API_KEY:
        try:
            raw = openai_candidates(transcript, media, metadata)
            provider, model_name = "local-agent-openai-multipass", core.OPENAI_MODEL
        except Exception as error:
            print(f"openai_multipass_failed:{type(error).__name__}:{str(error)[:500]}", flush=True)
    raw.extend(heuristic_candidates(transcript, media))
    candidates = merge_candidates(raw, transcript, media)
    minimum, _, _ = target_clip_counts(duration)
    if len(candidates) < minimum and not TEST_MODE:
        try:
            fallback, fallback_provider, fallback_model = _original_select_candidates(transcript, media, visual, metadata)
            raw.extend({
                "startSeconds": item["startSeconds"], "endSeconds": item["endSeconds"],
                "hookStartSeconds": item["startSeconds"],
                "hookEndSeconds": min(item["endSeconds"], item["startSeconds"] + 5),
                "title": item["title"], "funnel": item["funnel"], "score": item["score"],
                "hook": item.get("hookMoment") or item["title"],
                "rationale": item.get("rationale") or "Sélection de secours.",
            } for item in fallback)
            candidates = merge_candidates(raw, transcript, media)
            if provider == "local-agent-rules-v74":
                provider, model_name = fallback_provider, fallback_model
        except Exception as error:
            print(f"legacy_selection_failed:{type(error).__name__}:{str(error)[:300]}", flush=True)
    return candidates, provider, model_name


def segment_words(segment: dict[str, Any]) -> list[dict[str, Any]]:
    words = segment.get("words")
    return [word for word in words if isinstance(word, dict)] if isinstance(words, list) and words else synthetic_words(
        core.clean_text(segment.get("text")), float(segment["start"]), float(segment["end"])
    )


def split_interval(start: float, end: float, max_duration: float = 5.8):
    duration = end - start
    if duration <= max_duration:
        return [(start, end)]
    count = max(2, math.ceil(duration / max_duration))
    step = duration / count
    return [(start + index * step, start + (index + 1) * step) for index in range(count)]


def build_montage_segments(candidate: dict[str, Any]):
    clip_start = float(candidate["startSeconds"])
    clip_end = float(candidate["endSeconds"])
    ranges: list[tuple[float, float]] = []
    for segment in candidate["transcriptSegments"]:
        start = max(clip_start, float(segment["start"]) - 0.10)
        end = min(clip_end, float(segment["end"]) + 0.16)
        if end - start < 0.22:
            continue
        if ranges and start - ranges[-1][1] <= 0.32:
            ranges[-1] = (ranges[-1][0], max(ranges[-1][1], end))
        else:
            ranges.append((start, end))
    shots = []
    for start, end in ranges:
        shots.extend({"sourceStart": round(a, 3), "sourceEnd": round(b, 3)} for a, b in split_interval(start, end))
    if not shots:
        shots = [{"sourceStart": clip_start, "sourceEnd": clip_end}]
    timeline = 0.0
    for index, shot in enumerate(shots):
        shot_duration = max(0.05, shot["sourceEnd"] - shot["sourceStart"])
        shot["timelineStart"] = round(timeline, 3)
        timeline += shot_duration
        shot["timelineEnd"] = round(timeline, 3)
        shot["punchIn"] = 1.08 if index % 3 == 1 else (1.04 if index % 3 == 2 else 1.0)
    candidate["montageSegments"] = shots
    candidate["montageDurationSeconds"] = round(timeline, 3)
    candidate["removedSilenceSeconds"] = round(max(0.0, clip_end - clip_start - timeline), 3)
    return shots


def face_activity_score(current_gray, previous_gray, face):
    x, y, width, height = face
    y1, y2 = max(0, y + round(height * 0.52)), min(current_gray.shape[0], y + height)
    x1, x2 = max(0, x), min(current_gray.shape[1], x + width)
    if previous_gray is None or y2 <= y1 or x2 <= x1:
        return 0.0
    current = current_gray[y1:y2, x1:x2]
    previous = previous_gray[y1:y2, x1:x2]
    return 0.0 if current.shape != previous.shape or current.size == 0 else float(core.cv2.absdiff(current, previous).mean()) / 255


def track_active_speaker(source: Path, shots: list[dict[str, Any]], media: dict[str, Any]):
    capture = core.cv2.VideoCapture(str(source))
    classifier = build_face_classifier()
    previous_center = 0.5
    tracked = []
    try:
        for index, shot in enumerate(shots):
            start, end = float(shot["sourceStart"]), float(shot["sourceEnd"])
            observations = []
            for fraction in (0.28, 0.52, 0.76):
                second = start + (end - start) * fraction
                previous_frame = read_frame(capture, max(start, second - 0.16))
                current_frame = read_frame(capture, second)
                if current_frame is None:
                    continue
                small = resize_for_detection(current_frame)
                gray = core.cv2.cvtColor(small, core.cv2.COLOR_BGR2GRAY)
                previous_gray = None
                if previous_frame is not None:
                    previous_small = core.cv2.resize(previous_frame, (small.shape[1], small.shape[0]))
                    previous_gray = core.cv2.cvtColor(previous_small, core.cv2.COLOR_BGR2GRAY)
                faces = detect_faces(classifier, gray)
                scored = []
                frame_area = max(1, small.shape[0] * small.shape[1])
                for face in faces:
                    x, y, face_width, face_height = face
                    center_x = (x + face_width / 2) / small.shape[1]
                    center_y = (y + face_height * 0.42) / small.shape[0]
                    area = (face_width * face_height) / frame_area
                    motion = face_activity_score(gray, previous_gray, face)
                    continuity = max(0.0, 1.0 - abs(center_x - previous_center))
                    scored.append((area * 3.0 + motion * 2.4 + continuity * 0.12, center_x, center_y))
                if scored:
                    observations.append(max(scored, key=lambda value: value[0]))
            if observations:
                center_x = float(core.np.median([item[1] for item in observations]))
                center_y = float(core.np.median([item[2] for item in observations]))
                confidence = float(core.np.mean([item[0] for item in observations]))
                if abs(center_x - previous_center) < 0.12:
                    center_x = previous_center * 0.62 + center_x * 0.38
                previous_center = max(0.08, min(0.92, center_x))
                face_tracked = True
            else:
                center_x, center_y, confidence, face_tracked = previous_center, 0.38, 0.0, False
            enriched = dict(shot)
            enriched.update({
                "cropCenterX": round(center_x, 4), "cropCenterY": round(max(0.18, min(0.70, center_y)), 4),
                "faceTracked": face_tracked, "speakerConfidence": round(confidence, 4), "shotIndex": index + 1,
            })
            tracked.append(enriched)
    finally:
        capture.release()
    switches = sum(1 for left, right in zip(tracked, tracked[1:]) if abs(left["cropCenterX"] - right["cropCenterX"]) > 0.22)
    for shot in tracked:
        shot["speakerSwitches"] = switches
    return tracked


def caption_words_for_shot(candidate: dict[str, Any], shot: dict[str, Any]):
    source_start, source_end = float(shot["sourceStart"]), float(shot["sourceEnd"])
    timeline_start = float(shot["timelineStart"])
    output = []
    for segment in candidate["transcriptSegments"]:
        for word in segment_words(segment):
            word_start, word_end = float(word["start"]), float(word["end"])
            if word_end <= source_start or word_start >= source_end:
                continue
            output.append({
                "start": timeline_start + max(0.0, word_start - source_start),
                "end": timeline_start + min(source_end - source_start, word_end - source_start),
                "text": core.clean_text(word["text"]),
            })
    return output


def wrap_caption(tokens: list[str], max_line_chars: int = 24) -> str:
    lines, current = [], ""
    for token in [token for token in tokens if token]:
        candidate = token if not current else f"{current} {token}"
        if len(candidate) <= max_line_chars or not current:
            current = candidate
        else:
            lines.append(current)
            current = token
    if current:
        lines.append(current)
    if len(lines) > 2:
        lines = [lines[0], " ".join(lines[1:])]
    return r"\N".join(lines[:2])


def build_caption_events(candidate: dict[str, Any], shots: list[dict[str, Any]]):
    words = sorted((word for shot in shots for word in caption_words_for_shot(candidate, shot)), key=lambda word: word["start"])
    events, group = [], []
    for word in words:
        proposed = group + [word]
        text = " ".join(item["text"] for item in proposed)
        duration = proposed[-1]["end"] - proposed[0]["start"]
        should_break = len(proposed) > 7 or len(text) > 46 or duration > 2.2 or (
            group and re.search(r"[.!?…]$", group[-1]["text"]) and len(group) >= 3
        )
        if should_break:
            events.append({
                "start": group[0]["start"], "end": max(group[-1]["end"], group[0]["start"] + 0.45),
                "text": wrap_caption([item["text"] for item in group]),
            })
            group = [word]
        else:
            group = proposed
    if group:
        events.append({
            "start": group[0]["start"], "end": max(group[-1]["end"], group[0]["start"] + 0.45),
            "text": wrap_caption([item["text"] for item in group]),
        })
    return events


def ass_escape(value: str) -> str:
    return core.clean_text(value).replace("\\", r"\\").replace("{", "(").replace("}", ")")


def write_subtitles(path: Path, segments: list[dict[str, Any]], clip_start: float, clip_end: float) -> None:
    candidate = getattr(write_subtitles, "_candidate", None)
    if not isinstance(candidate, dict):
        candidate = {
            "startSeconds": clip_start, "endSeconds": clip_end, "transcriptSegments": segments,
            "hookMoment": core.clean_text(segments[0]["text"]) if segments else "",
        }
    shots = candidate.get("montageSegments") or build_montage_segments(candidate)
    captions = build_caption_events(candidate, shots)
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: NeptuneCaption,DejaVu Sans,58,&H00FFFFFF,&H00FFFFFF,&H0010172E,&H9A061020,1,0,0,0,100,100,0,0,3,2,0,2,110,110,315,1
Style: NeptuneHook,DejaVu Sans,70,&H00FFFFFF,&H00FFFFFF,&H0010172E,&HAA10172E,1,0,0,0,100,100,0,0,3,2,0,8,95,95,205,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    hook = wrap_caption(core.clean_text(candidate.get("hookMoment") or candidate.get("title") or "").split(), 22)
    montage_duration = float(candidate.get("montageDurationSeconds") or max(0.0, clip_end - clip_start))
    if hook:
        events.append(
            f"Dialogue: 1,{core.ass_time(0)},{core.ass_time(min(2.8, montage_duration))},NeptuneHook,,0,0,0,,{{\\fad(80,140)}}{ass_escape(hook)}"
        )
    for caption in captions:
        text = ass_escape(caption["text"]).replace(r"\\N", r"\N")
        events.append(
            f"Dialogue: 0,{core.ass_time(caption['start'])},{core.ass_time(caption['end'])},NeptuneCaption,,0,0,0,,{{\\fad(45,70)}}{text}"
        )
    path.write_text(header + "\n".join(events) + "\n", encoding="utf-8")


def crop_geometry(media: dict[str, Any], center_x: float, center_y: float, zoom: float):
    width, height = max(2, int(media["width"])), max(2, int(media["height"]))
    base_height = min(height, round(width * 16 / 9))
    base_width = min(width, round(base_height * 9 / 16))
    crop_height = max(2, min(height, round(base_height / max(1.0, zoom))))
    crop_width = max(2, min(width, round(crop_height * 9 / 16)))
    crop_width -= crop_width % 2
    crop_height -= crop_height % 2
    x = max(0, min(width - crop_width, round(center_x * width - crop_width / 2)))
    y = max(0, min(height - crop_height, round(center_y * height - crop_height * 0.36)))
    return crop_width, crop_height, x - x % 2, y - y % 2


def escape_filter_path(path: Path) -> str:
    return str(path).replace("\\", "/").replace(":", r"\:").replace("'", r"\'")


def render_clip(source: Path, output: Path, subtitles: Path, candidate: dict[str, Any], media: dict[str, Any]) -> None:
    shots = candidate.get("montageSegments") or build_montage_segments(candidate)
    tracked = track_active_speaker(source, shots, media)
    candidate["montageSegments"] = tracked
    candidate["faceTracked"] = any(bool(shot.get("faceTracked")) for shot in tracked)
    candidate["speakerSwitches"] = max([int(shot.get("speakerSwitches") or 0) for shot in tracked] or [0])
    write_subtitles._candidate = candidate
    write_subtitles(subtitles, candidate["transcriptSegments"], candidate["startSeconds"], candidate["endSeconds"])
    write_subtitles._candidate = None
    filter_parts, video_labels, audio_labels = [], [], []
    has_audio = bool(media.get("audioCodec"))
    for index, shot in enumerate(tracked):
        start, end = float(shot["sourceStart"]), float(shot["sourceEnd"])
        crop_width, crop_height, x, y = crop_geometry(
            media, float(shot["cropCenterX"]), float(shot["cropCenterY"]), float(shot.get("punchIn") or 1.0)
        )
        video_label = f"v{index}"
        filter_parts.append(
            f"[0:v]trim=start={start:.3f}:end={end:.3f},setpts=PTS-STARTPTS,"
            f"crop={crop_width}:{crop_height}:{x}:{y},scale=1080:1920:flags=lanczos,setsar=1[{video_label}]"
        )
        video_labels.append(f"[{video_label}]")
        if has_audio:
            audio_label = f"a{index}"
            filter_parts.append(
                f"[0:a]atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0[{audio_label}]"
            )
            audio_labels.append(f"[{audio_label}]")
    if has_audio:
        concat_inputs = "".join(f"{video_labels[index]}{audio_labels[index]}" for index in range(len(video_labels)))
        filter_parts.append(f"{concat_inputs}concat=n={len(video_labels)}:v=1:a=1[vcat][acat]")
    else:
        filter_parts.append(f"{''.join(video_labels)}concat=n={len(video_labels)}:v=1:a=0[vcat]")
    filter_parts.append(f"[vcat]ass='{escape_filter_path(subtitles)}'[vout]")
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(source),
        "-filter_complex", ";".join(filter_parts), "-map", "[vout]",
    ]
    if has_audio:
        command.extend(["-map", "[acat]"])
    command.extend(["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"])
    if has_audio:
        command.extend(["-c:a", "aac", "-b:a", "160k"])
    command.extend(["-movflags", "+faststart", "-y", str(output)])
    core.run(command, timeout=max(1200, round(float(candidate.get("montageDurationSeconds") or 30) * 35)))
    if not output.exists() or output.stat().st_size < 20_000:
        raise RuntimeError("rendered_clip_empty")


core.visual_profile = visual_profile
core.transcribe = test_transcribe if TEST_MODE else transcribe
core.select_candidates = select_candidates
core.write_subtitles = write_subtitles
core.render_clip = render_clip
