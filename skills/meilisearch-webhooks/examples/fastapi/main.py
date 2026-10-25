# Generated with: meilisearch-webhooks skill
# https://github.com/hookdeck/webhook-skills
import gzip
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time string comparison (compare_digest on equal-length digests of bytes)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_meilisearch_request(headers, config=os.environ) -> bool:
    """Meilisearch does not sign payloads. The only credential is the Authorization
    header you configured, sent verbatim. Compare the WHOLE value, including any
    "Bearer " or "Basic " prefix: don't strip, parse or base64-decode it.
    """
    expected = config.get("MEILISEARCH_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


def parse_tasks(raw: bytes, content_encoding: str = "") -> list:
    """The body is ndjson (one finished task object per line), gzip-compressed when the
    sender sets Content-Encoding: gzip. Raises ValueError if it can't be decoded."""
    try:
        if "gzip" in (content_encoding or "").lower():
            raw = gzip.decompress(raw)
        tasks = [json.loads(line) for line in raw.decode("utf-8").splitlines() if line.strip()]
    except (OSError, EOFError, UnicodeDecodeError, json.JSONDecodeError) as err:
        raise ValueError("Invalid gzip or ndjson body") from err
    # one JSON object per line, never the whole body
    if not all(isinstance(task, dict) for task in tasks):
        raise ValueError("Expected one JSON object per line")
    return tasks


async def require_meilisearch_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read."""
    if not verify_meilisearch_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_task(task: dict) -> None:
    label = f"{task.get('type')} task {task.get('uid')} on {task.get('indexUid') or 'n/a'}: {task.get('status')}"

    if task.get("status") == "failed":
        print(f"Failed {label}", (task.get("error") or {}).get("message"))
        # TODO: alert your team (e.g. post to Slack)
        return
    if task.get("status") == "canceled":
        print(f"Canceled {label}")
        return

    task_type = task.get("type")
    if task_type == "documentAdditionOrUpdate":
        print(f"{label} ({(task.get('details') or {}).get('indexedDocuments')} documents indexed)")
        # TODO: purge your CDN or application cache
    elif task_type in (
        "documentDeletion",
        "settingsUpdate",
        "indexCreation",
        "indexUpdate",
        "indexDeletion",
        "indexSwap",
        "dumpCreation",
        "snapshotCreation",
        "taskCancelation",
        "taskDeletion",
    ):
        print(label)
    else:
        print(f"Unhandled Meilisearch task type: {task_type}")


@app.post("/webhooks/meilisearch", dependencies=[Depends(require_meilisearch_auth)])
async def meilisearch_webhook(request: Request):
    # Raw bytes: the body is gzip-compressed ndjson.
    raw_body = await request.body()

    try:
        tasks = parse_tasks(raw_body, request.headers.get("content-encoding", ""))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid gzip or ndjson body")

    try:
        for task in tasks:
            handle_task(task)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Meilisearch webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True, "tasks": len(tasks)}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
