from __future__ import annotations

import threading
import time
from typing import Any

import httpx
from fastapi import HTTPException
from pydantic import HttpUrl

import app as legacy
import app_v69 as live

app = legacy.app
executor = legacy.executor


class JobRequestV71(legacy.JobRequest):
    heartbeatUrl: HttpUrl | None = None


# Replace the historical POST /jobs route while preserving health and status routes.
app.router.routes[:] = [
    route
    for route in app.router.routes
    if not (getattr(route, "path", "") == "/jobs" and "POST" in (getattr(route, "methods", set()) or set()))
]


@app.post("/jobs", status_code=202)
def create_job_v71(job: JobRequestV71) -> dict[str, Any]:
    job_id = legacy.safe_id(job.jobId)
    if not job_id:
        raise HTTPException(status_code=400, detail="invalid_job_id")
    with legacy.active_lock:
        current = legacy.active_jobs.get(job_id)
        if current and current.get("state") in {"queued", "processing"}:
            return {
                "ok": True,
                "accepted": False,
                "deduplicated": True,
                "jobId": job_id,
                "stage": current.get("stage", "starting"),
                "progress": current.get("progress", 8),
            }
        legacy.active_jobs[job_id] = {
            "jobId": job_id,
            "state": "queued",
            "stage": "queued",
            "progress": 5,
        }
    executor.submit(process_job_v71, job)
    return {"ok": True, "accepted": True, "jobId": job_id, "stage": "starting", "progress": 8}


def process_job_v71(job: JobRequestV71) -> None:
    job_id = legacy.safe_id(job.jobId)
    stopped = threading.Event()
    reporter = None
    if job.heartbeatUrl:
        reporter = threading.Thread(
            target=report_heartbeat,
            args=(job_id, str(job.heartbeatUrl), stopped),
            daemon=True,
            name=f"neptune-persisted-heartbeat-{job_id[:18]}",
        )
        reporter.start()
    try:
        live.process_job(job)
    finally:
        stopped.set()
        if reporter:
            reporter.join(timeout=1.0)


def report_heartbeat(job_id: str, heartbeat_url: str, stopped: threading.Event) -> None:
    # The first report is intentionally fast so the Studio can distinguish a real
    # start from a queued or failed dispatch. Subsequent writes are limited to one
    # every twenty seconds to avoid needless persistence churn.
    delay = 2.0
    while not stopped.wait(delay):
        delay = 20.0
        with legacy.active_lock:
            current = dict(legacy.active_jobs.get(job_id, {}))
        if not current:
            continue
        state = str(current.get("state") or "")
        if state not in {"queued", "processing"}:
            return
        payload = {
            "state": state,
            "stage": str(current.get("stage") or "starting"),
            "progress": int(current.get("progress") or 8),
            "heartbeatAt": str(current.get("heartbeatAt") or current.get("updatedAt") or ""),
        }
        try:
            response = httpx.post(
                heartbeat_url,
                json=payload,
                timeout=httpx.Timeout(10, read=20),
            )
            response.raise_for_status()
        except Exception as error:  # noqa: BLE001 - heartbeat failure must not stop rendering
            print(f"video_processor_heartbeat_failed:{type(error).__name__}:{str(error)[:300]}", flush=True)
