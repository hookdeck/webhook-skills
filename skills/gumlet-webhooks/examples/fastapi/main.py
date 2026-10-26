# Generated with: gumlet-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides: compare_digest raises on non-ASCII str."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_gumlet_request(headers, secret=None) -> bool:
    """Gumlet does not sign payloads. If the webhook has a Secret Token, Gumlet sends it
    back as plain text in the x-gumlet-token header of every request. Compare the whole
    value. This authenticates the sender only: no body integrity, no replay protection.
    """
    secret = secret if secret is not None else os.environ.get("GUMLET_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get("x-gumlet-token")
    return bool(received) and safe_equal(received, secret)


async def require_gumlet_token(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_gumlet_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing x-gumlet-token")


def handle_event(payload: dict) -> None:
    type_ = payload.get('type')

    if type_ in ("video.status.created", "video.status.stream_ready", "video.status.downloaded", "video.status.processed"):
        print(f"Video {payload.get('status')}: {payload.get('asset_id')}")
        # TODO: update processing progress for payload["asset_id"]

    elif type_ == "video.status.ready":
        print(f"Video ready: {payload.get('asset_id')}")
        # TODO: store payload["output"]["playback_url"] and publish the video

    elif type_ == "video.status.errored":
        print(f"Video errored: {payload.get('asset_id')}")
        # TODO: alert and retry the upload

    elif type_ == "video.status.deleted":
        print(f"Video deleted: {payload.get('asset_id')}")
        # TODO: remove local records

    elif type_ == "video.status.repackaged":
        print(f"Video repackaged: {payload.get('asset_id')}")
        # TODO: refresh playback info

    elif type_ in ("live.video.status.created", "live.video.status.preparing", "live.video.status.ready", "live.video.status.connected", "live.video.status.active", "live.video.status.disconnected"):
        print(f"Live stream {payload.get('status')}: {payload.get('live_asset_id')}")
        # TODO: update the live session state

    elif type_ == "live.video.status.complete":
        print(f"Live stream complete: {payload.get('live_asset_id')}")
        # TODO: link payload["recording_asset_id"] and payload["vod_collection_id"]

    elif type_ in ("event.video.uploaded", "event.video.updated"):
        print(f"Video event: {type_}")
        # TODO: start downstream workflows or sync metadata

    elif type_ in ("event.embed.viewed", "event.embed.cta_clicked"):
        print(f"Embed event: {type_}")
        # TODO: record analytics

    elif type_ == "event.embed.form_submitted":
        print(f'Lead captured')
        # TODO: send the lead to your CRM

    elif type_ in ("event.playlist.created", "event.playlist.asset", "event.playlist.deleted"):
        print(f"Playlist event: {type_}")
        # TODO: sync playlists

    elif type_ == "event.comment.all":
        print(f'Comment event')
        # TODO: moderate or sync comments

    elif type_ == "event.channel.member_joined":
        print(f'Channel member joined')
        # TODO: onboard the member

    else:
        print(f"Unhandled event: {type_}")


@app.post("/webhooks/gumlet", dependencies=[Depends(require_gumlet_token)])
async def gumlet_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Gumlet event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
