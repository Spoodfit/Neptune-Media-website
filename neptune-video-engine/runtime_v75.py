
from __future__ import annotations

import math
import os
import re
from pathlib import Path
from typing import Any

import app as core
import runtime_v74 as v74
from fastapi import Request

VERSION = "neptune-video-engine-20260803-v75"
core.VERSION = VERSION
core.app.version = VERSION
app = core.app

TEST_MODE = os.getenv("NEPTUNE_ENGINE_TEST_MODE", "").strip() == "1"
MIN_SCORE = max(58, min(85, int(os.getenv("NEPTUNE_MIN_EDITORIAL_SCORE", "60"))))
MIN_PER_HOUR = max(12, int(os.getenv("NEPTUNE_MIN_CLIPS_PER_HOUR", "16")))
TARGET_PER_HOUR = max(MIN_PER_HOUR, int(os.getenv("NEPTUNE_TARGET_CLIPS_PER_HOUR", "20")))
MAX_PER_HOUR = max(TARGET_PER_HOUR, int(os.getenv("NEPTUNE_MAX_CLIPS_PER_HOUR", "24")))
YUNET_MODEL = Path(os.getenv("NEPTUNE_YUNET_MODEL", "/app/face_detection_yunet_2023mar.onnx"))
FILLER_PATTERN = re.compile(
    r"\b(bonjour|bienvenue|aujourd'hui je vais|je vais vous parler|pour commencer|"
    r"alors du coup|donc voilà|euh|bah|en fait voilà|merci de|comme je disais)\b",
    re.I,
)
HOOK_PATTERN = re.compile(
    r"\b(pourquoi|comment|personne|jamais|toujours|erreur|problème|vérité|secret|"
    r"risque|coûte|bloque|perd|gagne|grave|attention|contraire|faux|mensonge|"
    r"piège|limite|chiffre|euros?|jours?|mois|ans|%)\b",
    re.I,
)
CONCRETE_PATTERN = re.compile(
    r"\b(client|entreprise|vente|résultat|méthode|étape|preuve|exemple|cas|"
    r"expérience|solution|décision|prix|offre|équipe|marché|audience)\b",
    re.I,
)


@app.middleware("http")
async def v75_release_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Neptune-Video-Engine"] = VERSION
    response.headers["X-Neptune-Video-Profile"] = "sentence-density-yunet-safe-captions-v75"
    response.headers["Cache-Control"] = "no-store"
    return response


def target_counts(duration_seconds: float) -> tuple[int, int, int]:
    hours = max(0.25, float(duration_seconds) / 3600.0)
    minimum = max(4, math.ceil(hours * MIN_PER_HOUR))
    target = max(minimum, math.ceil(hours * TARGET_PER_HOUR))
    maximum = max(target, math.ceil(hours * MAX_PER_HOUR))
    return min(minimum, 36), min(target, 44), min(maximum, 52)


def _words_for_segment(segment: dict[str, Any]) -> list[dict[str, Any]]:
    words = segment.get("words")
    if isinstance(words, list) and words:
        cleaned = []
        for word in words:
            if not isinstance(word, dict):
                continue
            text = core.clean_text(word.get("text"))
            if not text:
                continue
            cleaned.append({
                "start": float(word.get("start", segment.get("start", 0))),
                "end": float(word.get("end", segment.get("end", 0))),
                "text": text,
            })
        if cleaned:
            return cleaned
    return v74.synthetic_words(
        core.clean_text(segment.get("text")),
        float(segment.get("start", 0)),
        float(segment.get("end", 0)),
    )


def sentence_units(transcript: dict[str, Any]) -> list[dict[str, Any]]:
    units: list[dict[str, Any]] = []
    for segment in transcript.get("segments") or []:
        words = _words_for_segment(segment)
        group: list[dict[str, Any]] = []
        for word in words:
            group.append(word)
            duration = float(group[-1]["end"]) - float(group[0]["start"])
            should_close = bool(re.search(r"[.!?…][”\"')\]]?$", str(word["text"])))
            should_close = should_close or len(group) >= 24 or duration >= 11.5
            if should_close:
                units.append(_unit_from_words(group))
                group = []
        if group:
            units.append(_unit_from_words(group))

    compact: list[dict[str, Any]] = []
    for unit in units:
        if compact and len(unit["text"].split()) < 4:
            previous = compact[-1]
            previous["end"] = unit["end"]
            previous["text"] = core.clean_text(f"{previous['text']} {unit['text']}")
            previous["words"].extend(unit["words"])
        else:
            compact.append(unit)

    merged: list[dict[str, Any]] = []
    for unit in compact:
        if merged and float(unit["start"]) - float(merged[-1]["end"]) < 0.12 and len(merged[-1]["text"].split()) < 5:
            previous = merged[-1]
            previous["end"] = unit["end"]
            previous["text"] = core.clean_text(f"{previous['text']} {unit['text']}")
            previous["words"].extend(unit["words"])
        else:
            merged.append(unit)
    return merged


def _unit_from_words(words: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "start": round(float(words[0]["start"]), 3),
        "end": round(float(words[-1]["end"]), 3),
        "text": core.clean_text(" ".join(str(word["text"]) for word in words)),
        "words": [dict(word) for word in words],
    }


def hook_score(text: str) -> float:
    value = core.clean_text(text)
    lowered = value.lower()
    score = 0.0
    score += min(18.0, len(HOOK_PATTERN.findall(value)) * 4.2)
    score += min(10.0, len(CONCRETE_PATTERN.findall(value)) * 2.0)
    score += 6.0 if re.search(r"\d|%|€", value) else 0.0
    score += 5.0 if value.rstrip().endswith("?") else 0.0
    score += 4.0 if re.search(r"\b(j'ai|je n'ai|nous avons|un client|la première fois)\b", lowered) else 0.0
    score += 3.0 if 7 <= len(value.split()) <= 22 else 0.0
    score -= 18.0 if FILLER_PATTERN.search(value) else 0.0
    score -= 8.0 if len(value.split()) < 5 else 0.0
    return score


def window_score(units: list[dict[str, Any]]) -> int:
    text = core.clean_text(" ".join(item["text"] for item in units))
    duration = float(units[-1]["end"]) - float(units[0]["start"])
    score = 55.0 + min(18.0, hook_score(units[0]["text"]) * 0.7)
    score += min(10.0, len(CONCRETE_PATTERN.findall(text)) * 1.25)
    score += 5.0 if re.search(r"\d|%|€", text) else 0.0
    score += 4.0 if text.rstrip().endswith((".", "!", "?")) else -4.0
    score += 5.0 if 20 <= duration <= 58 else 0.0
    score -= 14.0 if FILLER_PATTERN.search(units[0]["text"]) else 0.0
    return max(45, min(96, round(score)))


def _title_from_hook(hook: str) -> str:
    words = core.clean_text(hook).split()
    title = " ".join(words[:13]).rstrip(" ,;:-")
    return title[:110] or "Moment fort de l’interview"


def _candidate_from_units(units: list[dict[str, Any]], index: int, source: str) -> dict[str, Any]:
    start = max(0.0, float(units[0]["start"]) - 0.08)
    end = float(units[-1]["end"]) + 0.14
    hook = core.clean_text(units[0]["text"])
    score = window_score(units)
    title = _title_from_hook(hook)
    funnel = v74.infer_funnel(core.clean_text(" ".join(item["text"] for item in units)))
    return {
        "id": f"clip-{index + 1:02d}-{core.uuid.uuid4().hex[:8]}",
        "startSeconds": round(start, 3),
        "endSeconds": round(end, 3),
        "hookStartSeconds": round(float(units[0]["start"]), 3),
        "hookEndSeconds": round(min(float(units[0]["end"]), float(units[0]["start"]) + 5.5), 3),
        "title": title,
        "funnel": funnel,
        "score": score,
        "scoreBreakdown": {
            "hook": min(22, round(score * 0.22)),
            "autonomy": min(18, round(score * 0.18)),
            "value": min(16, round(score * 0.16)),
            "retention": min(14, round(score * 0.14)),
            "emotion": min(10, round(score * 0.10)),
            "originality": min(8, round(score * 0.08)),
            "marketing": min(7, round(score * 0.07)),
            "technical": min(5, round(score * 0.05)),
        },
        "rationale": (
            "Passage démarrant sur une phrase réellement prononcée, couvrant une seule idée "
            "et se terminant sur une unité de sens complète."
        ),
        "hookMoment": hook[:240],
        "captionPreset": "neptune-word-focus-safe-v3",
        "transcriptSegments": [dict(item) for item in units],
        "editorialProposals": core.editorial_proposals(title, hook, funnel),
        "montageMode": "sentence-cut-yunet-safe-layout-v75",
        "selectionSource": source,
    }


def local_sentence_candidates(transcript: dict[str, Any], media: dict[str, Any]) -> list[dict[str, Any]]:
    units = sentence_units(transcript)
    if not units:
        return []
    _, target, maximum = target_counts(float(media["durationSeconds"]))
    proposals: list[dict[str, Any]] = []
    for start_index, first in enumerate(units):
        if FILLER_PATTERN.search(first["text"]) and hook_score(first["text"]) < 2:
            continue
        selected: list[dict[str, Any]] = []
        for item in units[start_index:]:
            gap = float(item["start"]) - (float(selected[-1]["end"]) if selected else float(first["start"]))
            if selected and gap > 2.8:
                break
            selected.append(item)
            duration = float(selected[-1]["end"]) - float(selected[0]["start"])
            if duration < 18:
                continue
            if duration > 68:
                break
            complete = selected[-1]["text"].rstrip().endswith((".", "!", "?", "…"))
            if duration >= 26 and complete:
                break
        duration = float(selected[-1]["end"]) - float(selected[0]["start"]) if selected else 0
        if duration < 16:
            continue
        candidate = _candidate_from_units(selected, len(proposals), "sentence-density-v75")
        if candidate["score"] >= MIN_SCORE and hook_score(candidate["hookMoment"]) >= 1:
            proposals.append(candidate)

    proposals.sort(
        key=lambda candidate: (
            -int(candidate["score"]),
            -hook_score(candidate["hookMoment"]),
            float(candidate["startSeconds"]),
        )
    )

    selected: list[dict[str, Any]] = []
    bucket_seconds = 180.0
    buckets: dict[int, list[dict[str, Any]]] = {}
    for candidate in proposals:
        buckets.setdefault(int(float(candidate["startSeconds"]) // bucket_seconds), []).append(candidate)

    for bucket in sorted(buckets):
        for candidate in buckets[bucket][:2]:
            if _can_add(candidate, selected, 0.58):
                selected.append(candidate)
                break

    for candidate in proposals:
        if len(selected) >= target:
            break
        if _can_add(candidate, selected, 0.55):
            selected.append(candidate)

    if len(selected) < target:
        for bucket in sorted(buckets):
            for candidate in buckets[bucket][1:3]:
                if len(selected) >= target:
                    break
                if _can_add(candidate, selected, 0.72):
                    selected.append(candidate)

    if len(selected) < min(target, len(proposals)):
        for candidate in proposals:
            if len(selected) >= min(target, len(proposals)):
                break
            if candidate not in selected and _can_add(candidate, selected, 0.92):
                selected.append(candidate)

    selected.sort(key=lambda item: float(item["startSeconds"]))
    return selected[:maximum]


def _can_add(candidate: dict[str, Any], selected: list[dict[str, Any]], max_overlap: float) -> bool:
    for existing in selected:
        if v74.overlap_ratio(candidate, existing) > max_overlap:
            return False
        if (
            v74.text_similarity(candidate["hookMoment"], existing["hookMoment"]) > 0.78
            and abs(float(candidate["startSeconds"]) - float(existing["startSeconds"])) < 75
        ):
            return False
    return True


def _units_for_range(units: list[dict[str, Any]], start: float, end: float) -> list[dict[str, Any]]:
    selected = [unit for unit in units if float(unit["end"]) > start and float(unit["start"]) < end]
    if not selected:
        return []
    hook_index = max(
        range(min(3, len(selected))),
        key=lambda index: hook_score(selected[index]["text"]),
    )
    selected = selected[hook_index:]
    while selected and float(selected[-1]["end"]) - float(selected[0]["start"]) > 68:
        selected.pop()
    return selected


def ai_sentence_candidates(
    transcript: dict[str, Any],
    media: dict[str, Any],
    metadata: dict[str, Any],
) -> list[dict[str, Any]]:
    if not core.OPENAI_API_KEY:
        return []
    units = sentence_units(transcript)
    raw = v74.openai_candidates(transcript, media, metadata)
    output: list[dict[str, Any]] = []
    for item in raw:
        try:
            start = float(item.get("hookStartSeconds") or item.get("startSeconds") or 0)
            end = float(item.get("endSeconds") or start + 40)
        except (TypeError, ValueError):
            continue
        selected = _units_for_range(units, start, end)
        if not selected:
            continue
        candidate = _candidate_from_units(selected, len(output), "openai-multipass-v75")
        candidate["score"] = max(candidate["score"], min(100, int(item.get("score") or 0)))
        candidate["title"] = core.clean_text(item.get("title") or candidate["title"])[:110]
        candidate["funnel"] = str(item.get("funnel") or candidate["funnel"]).upper()
        candidate["rationale"] = core.clean_text(item.get("rationale") or candidate["rationale"])[:500]
        candidate["hookMoment"] = core.clean_text(selected[0]["text"])[:240]
        output.append(candidate)
    return output


def select_candidates(
    transcript: dict[str, Any],
    media: dict[str, Any],
    visual: dict[str, Any],
    metadata: dict[str, Any],
):
    if TEST_MODE:
        return v74.select_candidates(transcript, media, visual, metadata)

    local = local_sentence_candidates(transcript, media)
    ai = []
    provider = "sentence-density-v75"
    model = "neptune-sentence-editor-v5"
    if core.OPENAI_API_KEY:
        try:
            ai = ai_sentence_candidates(transcript, media, metadata)
            if ai:
                provider = "openai-multipass-plus-sentence-density-v75"
                model = core.OPENAI_MODEL
        except Exception as error:
            print(f"v75_openai_failed:{type(error).__name__}:{str(error)[:500]}", flush=True)

    _, target, maximum = target_counts(float(media["durationSeconds"]))
    combined = sorted(ai + local, key=lambda item: (-int(item["score"]), float(item["startSeconds"])))
    selected: list[dict[str, Any]] = []
    for candidate in combined:
        if len(selected) >= target:
            break
        if _can_add(candidate, selected, 0.68):
            selected.append(candidate)
    if len(selected) < target:
        for candidate in combined:
            if len(selected) >= min(target, len(combined)):
                break
            if candidate not in selected and _can_add(candidate, selected, 0.84):
                selected.append(candidate)
    selected.sort(key=lambda item: float(item["startSeconds"]))
    return selected[:maximum], provider, model


_yunet = None


def get_yunet():
    global _yunet
    if _yunet is not None:
        return _yunet
    factory = getattr(core.cv2, "FaceDetectorYN_create", None)
    if not callable(factory) or not YUNET_MODEL.exists():
        _yunet = False
        return None
    try:
        _yunet = factory(str(YUNET_MODEL), "", (320, 320), 0.72, 0.30, 5000)
        return _yunet
    except Exception as error:
        print(f"yunet_init_failed:{type(error).__name__}:{str(error)[:300]}", flush=True)
        _yunet = False
        return None


def detect_yunet(frame) -> list[dict[str, Any]]:
    detector = get_yunet()
    if not detector:
        return []
    height, width = frame.shape[:2]
    detector.setInputSize((width, height))
    try:
        _, faces = detector.detect(frame)
    except Exception:
        return []
    if faces is None:
        return []
    output = []
    frame_area = max(1, width * height)
    for row in faces:
        x, y, face_width, face_height = [float(value) for value in row[:4]]
        if face_width <= 1 or face_height <= 1:
            continue
        mouth_right = (float(row[10]), float(row[11]))
        mouth_left = (float(row[12]), float(row[13]))
        output.append({
            "x": x,
            "y": y,
            "width": face_width,
            "height": face_height,
            "centerX": (x + face_width / 2) / width,
            "centerY": (y + face_height * 0.44) / height,
            "area": (face_width * face_height) / frame_area,
            "mouthX": ((mouth_right[0] + mouth_left[0]) / 2) / width,
            "mouthY": ((mouth_right[1] + mouth_left[1]) / 2) / height,
            "confidence": float(row[-1]),
        })
    return output


def _mouth_motion(current_gray, previous_gray, face: dict[str, Any]) -> float:
    if previous_gray is None:
        return 0.0
    height, width = current_gray.shape[:2]
    cx = int(float(face["mouthX"]) * width)
    cy = int(float(face["mouthY"]) * height)
    half_w = max(8, int(float(face["width"]) * 0.23))
    half_h = max(6, int(float(face["height"]) * 0.13))
    x1, x2 = max(0, cx - half_w), min(width, cx + half_w)
    y1, y2 = max(0, cy - half_h), min(height, cy + half_h)
    current = current_gray[y1:y2, x1:x2]
    previous = previous_gray[y1:y2, x1:x2]
    if current.size == 0 or current.shape != previous.shape:
        return 0.0
    return float(core.cv2.absdiff(current, previous).mean()) / 255.0


def track_active_speaker(source: Path, shots: list[dict[str, Any]], media: dict[str, Any]):
    capture = core.cv2.VideoCapture(str(source))
    previous_center = 0.5
    tracked: list[dict[str, Any]] = []
    try:
        for index, shot in enumerate(shots):
            start, end = float(shot["sourceStart"]), float(shot["sourceEnd"])
            observations: list[dict[str, Any]] = []
            multi_face_frames = 0
            for fraction in (0.18, 0.36, 0.54, 0.72, 0.88):
                second = start + max(0.0, end - start) * fraction
                capture.set(core.cv2.CAP_PROP_POS_MSEC, max(start, second - 0.12) * 1000)
                ok_previous, previous_frame = capture.read()
                capture.set(core.cv2.CAP_PROP_POS_MSEC, second * 1000)
                ok_current, current_frame = capture.read()
                if not ok_current or current_frame is None:
                    continue
                current_small = v74.resize_for_detection(current_frame)
                current_gray = core.cv2.cvtColor(current_small, core.cv2.COLOR_BGR2GRAY)
                previous_gray = None
                if ok_previous and previous_frame is not None:
                    previous_small = core.cv2.resize(previous_frame, (current_small.shape[1], current_small.shape[0]))
                    previous_gray = core.cv2.cvtColor(previous_small, core.cv2.COLOR_BGR2GRAY)
                faces = detect_yunet(current_small)
                if len(faces) > 1:
                    multi_face_frames += 1
                for face in faces:
                    motion = _mouth_motion(current_gray, previous_gray, face)
                    continuity = max(0.0, 1.0 - abs(float(face["centerX"]) - previous_center))
                    score = (
                        float(face["area"]) * 5.0
                        + motion * 5.5
                        + float(face["confidence"]) * 0.35
                        + continuity * 0.10
                    )
                    observations.append({**face, "motion": motion, "activityScore": score})

            enriched = dict(shot)
            if observations:
                by_side: dict[int, list[dict[str, Any]]] = {}
                for observation in observations:
                    by_side.setdefault(int(float(observation["centerX"]) * 4), []).append(observation)
                tracks = []
                for values in by_side.values():
                    tracks.append({
                        "centerX": float(core.np.median([item["centerX"] for item in values])),
                        "centerY": float(core.np.median([item["centerY"] for item in values])),
                        "activity": float(core.np.mean([item["activityScore"] for item in values])),
                        "motion": float(core.np.mean([item["motion"] for item in values])),
                        "samples": len(values),
                    })
                tracks.sort(key=lambda item: item["activity"], reverse=True)
                best = tracks[0]
                second_activity = tracks[1]["activity"] if len(tracks) > 1 else 0.0
                ratio = best["activity"] / max(0.001, second_activity)
                confident = len(tracks) == 1 or (best["motion"] >= 0.012 and ratio >= 1.28)
                if confident:
                    center_x = max(0.08, min(0.92, best["centerX"]))
                    if abs(center_x - previous_center) < 0.10:
                        center_x = previous_center * 0.58 + center_x * 0.42
                    previous_center = center_x
                    crop_mode = "speaker"
                else:
                    center_x = 0.5
                    crop_mode = "full-frame-safe"
                enriched.update({
                    "cropCenterX": round(center_x, 4),
                    "cropCenterY": round(max(0.20, min(0.66, best["centerY"])), 4),
                    "faceTracked": confident,
                    "speakerConfidence": round(ratio if len(tracks) > 1 else 2.0, 3),
                    "cropMode": crop_mode,
                    "detector": "opencv-yunet",
                    "facesObserved": len(tracks),
                })
            else:
                enriched.update({
                    "cropCenterX": 0.5,
                    "cropCenterY": 0.40,
                    "faceTracked": False,
                    "speakerConfidence": 0.0,
                    "cropMode": "full-frame-safe",
                    "detector": "full-frame-fallback",
                    "facesObserved": 0,
                })
            enriched["shotIndex"] = index + 1
            enriched["multiFaceFrames"] = multi_face_frames
            tracked.append(enriched)
    finally:
        capture.release()

    switches = sum(
        1
        for left, right in zip(tracked, tracked[1:])
        if left.get("cropMode") == right.get("cropMode") == "speaker"
        and abs(float(left["cropCenterX"]) - float(right["cropCenterX"])) > 0.20
    )
    for shot in tracked:
        shot["speakerSwitches"] = switches
    return tracked


def caption_groups(candidate: dict[str, Any], shots: list[dict[str, Any]]):
    words = sorted(
        (word for shot in shots for word in v74.caption_words_for_shot(candidate, shot)),
        key=lambda word: float(word["start"]),
    )
    groups: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    for word in words:
        proposed = current + [word]
        text = " ".join(item["text"] for item in proposed)
        duration = float(proposed[-1]["end"]) - float(proposed[0]["start"])
        should_break = (
            len(proposed) > 5
            or len(text) > 34
            or duration > 1.65
            or (current and re.search(r"[.!?…]$", current[-1]["text"]))
        )
        if should_break and current:
            groups.append(current)
            current = [word]
        else:
            current = proposed
    if current:
        groups.append(current)
    return groups


def _line_indices(tokens: list[str], max_chars: int = 19) -> list[list[int]]:
    lines: list[list[int]] = [[]]
    length = 0
    for index, token in enumerate(tokens):
        addition = len(token) + (1 if lines[-1] else 0)
        if lines[-1] and length + addition > max_chars and len(lines) < 2:
            lines.append([])
            length = 0
            addition = len(token)
        lines[-1].append(index)
        length += addition
    return [line for line in lines if line]


def _safe_two_lines(tokens: list[str], max_chars: int = 19) -> str:
    return r"\N".join(" ".join(tokens[index] for index in line) for line in _line_indices(tokens, max_chars))


def _caption_text(group: list[dict[str, Any]], active_index: int) -> str:
    plain = [core.clean_text(word["text"]) for word in group]
    rendered = []
    for line in _line_indices(plain, 19):
        tokens = []
        for index in line:
            escaped = v74.ass_escape(plain[index])
            if index == active_index:
                tokens.append(r"{\c&H006FE8FF&\b1}" + escaped + r"{\c&H00FFFFFF&\b1}")
            else:
                tokens.append(escaped)
        rendered.append(" ".join(tokens))
    return r"\N".join(rendered)


def write_subtitles(path: Path, segments: list[dict[str, Any]], clip_start: float, clip_end: float) -> None:
    candidate = getattr(write_subtitles, "_candidate", None)
    if not isinstance(candidate, dict):
        candidate = {
            "startSeconds": clip_start,
            "endSeconds": clip_end,
            "transcriptSegments": segments,
            "hookMoment": core.clean_text(segments[0]["text"]) if segments else "",
        }
    shots = candidate.get("montageSegments") or v74.build_montage_segments(candidate)
    groups = caption_groups(candidate, shots)
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: NeptuneCaption,DejaVu Sans,64,&H00FFFFFF,&H00FFFFFF,&H00101828,&H8A070B16,1,0,0,0,100,100,0,0,3,2.4,0,2,125,125,330,1
Style: NeptuneHook,DejaVu Sans,56,&H00FFFFFF,&H00FFFFFF,&H00101828,&H9A070B16,1,0,0,0,100,100,0,0,3,2.2,0,8,145,145,190,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events: list[str] = []
    hook = core.clean_text(candidate.get("hookMoment") or "")
    montage_duration = float(candidate.get("montageDurationSeconds") or max(0.0, clip_end - clip_start))
    if hook and not FILLER_PATTERN.search(hook):
        hook_text = _safe_two_lines([v74.ass_escape(token) for token in hook.split()[:12]], 22)
        events.append(
            f"Dialogue: 1,{core.ass_time(0)},{core.ass_time(min(2.15, montage_duration))},"
            f"NeptuneHook,,0,0,0,,{{\\fad(80,120)}}{hook_text}"
        )

    for group in groups:
        for active_index, word in enumerate(group):
            start = max(float(group[0]["start"]), float(word["start"]))
            end = max(start + 0.12, float(word["end"]))
            events.append(
                f"Dialogue: 0,{core.ass_time(start)},{core.ass_time(end)},"
                f"NeptuneCaption,,0,0,0,,{_caption_text(group, active_index)}"
            )
    path.write_text(header + "\n".join(events) + "\n", encoding="utf-8")


def _full_frame_filter(index: int, shot: dict[str, Any], media: dict[str, Any]) -> str:
    start, end = float(shot["sourceStart"]), float(shot["sourceEnd"])
    punch = max(1.0, min(1.06, float(shot.get("punchIn") or 1.0)))
    return (
        f"[0:v]trim=start={start:.3f}:end={end:.3f},setpts=PTS-STARTPTS,"
        f"split=2[bg{index}][fg{index}];"
        f"[bg{index}]scale=1080:1920:force_original_aspect_ratio=increase,"
        f"crop=1080:1920,gblur=sigma=28,eq=brightness=-0.12:saturation=0.72[blur{index}];"
        f"[fg{index}]scale=980:1740:force_original_aspect_ratio=decrease[front{index}];"
        f"[blur{index}][front{index}]overlay=(W-w)/2:(H-h)/2[v{index}]"
    )


def render_clip(source: Path, output: Path, subtitles: Path, candidate: dict[str, Any], media: dict[str, Any]) -> None:
    shots = candidate.get("montageSegments") or v74.build_montage_segments(candidate)
    tracked = track_active_speaker(source, shots, media)
    candidate["montageSegments"] = tracked
    candidate["faceTracked"] = any(bool(shot.get("faceTracked")) for shot in tracked)
    candidate["speakerSwitches"] = max([int(shot.get("speakerSwitches") or 0) for shot in tracked] or [0])
    candidate["faceDetector"] = "opencv-yunet-with-full-frame-safe-fallback"
    write_subtitles._candidate = candidate
    write_subtitles(subtitles, candidate["transcriptSegments"], candidate["startSeconds"], candidate["endSeconds"])
    write_subtitles._candidate = None

    filter_parts: list[str] = []
    video_labels: list[str] = []
    audio_labels: list[str] = []
    has_audio = bool(media.get("audioCodec"))
    for index, shot in enumerate(tracked):
        start, end = float(shot["sourceStart"]), float(shot["sourceEnd"])
        if shot.get("cropMode") == "speaker":
            crop_width, crop_height, x, y = v74.crop_geometry(
                media,
                float(shot["cropCenterX"]),
                float(shot["cropCenterY"]),
                float(shot.get("punchIn") or 1.0),
            )
            filter_parts.append(
                f"[0:v]trim=start={start:.3f}:end={end:.3f},setpts=PTS-STARTPTS,"
                f"crop={crop_width}:{crop_height}:{x}:{y},"
                f"scale=1080:1920:flags=lanczos,setsar=1[v{index}]"
            )
        else:
            filter_parts.append(_full_frame_filter(index, shot, media))
        video_labels.append(f"[v{index}]")
        if has_audio:
            filter_parts.append(
                f"[0:a]atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS,"
                f"aresample=async=1:first_pts=0[a{index}]"
            )
            audio_labels.append(f"[a{index}]")

    if has_audio:
        concat_inputs = "".join(
            f"{video_labels[index]}{audio_labels[index]}" for index in range(len(video_labels))
        )
        filter_parts.append(f"{concat_inputs}concat=n={len(video_labels)}:v=1:a=1[vcat][acat]")
    else:
        filter_parts.append(f"{''.join(video_labels)}concat=n={len(video_labels)}:v=1:a=0[vcat]")
    filter_parts.append(f"[vcat]ass='{v74.escape_filter_path(subtitles)}'[vout]")

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
    core.run(command, timeout=max(1200, round(float(candidate.get("montageDurationSeconds") or 30) * 40)))
    if not output.exists() or output.stat().st_size < 20_000:
        raise RuntimeError("rendered_clip_empty")


core.select_candidates = select_candidates
core.write_subtitles = write_subtitles
core.render_clip = render_clip
