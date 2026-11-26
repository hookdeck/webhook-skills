# Generated with: bunny-stream-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

bunny_secret = os.environ.get("BUNNY_STREAM_WEBHOOK_SECRET")

# Human-readable names for Bunny Stream's numeric Status enum.
STATUS = {
    0: "Queued",
    1: "Processing",
    2: "Encoding",
    3: "Finished",
    4: "Resolution finished",
    5: "Failed",
    6: "PresignedUploadStarted",
    7: "PresignedUploadFinished",
    8: "PresignedUploadFailed",
    9: "CaptionsGenerated",
    10: "TitleOrDescriptionGenerated",
    11: "CaptionGenerationFailed",
    12: "ChaptersGenerated",
    13: "MomentsGenerated",
    32: "VideoDeleted",
    33: "SmartGenerationFailed",
}


def verify_bunny_stream(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify a Bunny Stream webhook signature.

    Bunny signs the EXACT raw request body with HMAC-SHA256, keyed on the video
    library's Read-Only API key, and sends the digest as lowercase hex in
    X-BunnyStream-Signature. Verify against the raw (unparsed) body.
    """
    if not signature_header:
        return False

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    # Timing-safe comparison.
    return hmac.compare_digest(signature_header, expected_signature)


@app.post("/webhooks/bunny-stream")
async def bunny_stream_webhook(request: Request):
    # Get the raw body for signature verification (do NOT parse first).
    raw_body = await request.body()
    signature_header = request.headers.get("x-bunnystream-signature")

    # Verify webhook signature against the raw body BEFORE parsing.
    if not verify_bunny_stream(raw_body, signature_header, bunny_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload after verification. Bunny's payload is thin:
    # { IsLiveStreamWebhook, VideoLibraryId, VideoGuid, Status, EventId, Timestamp }
    # plus Reason on SmartGenerationFailed. Deduplicate on EventId, which
    # stays the same on retries.
    payload = json.loads(raw_body)
    library_id = payload.get("VideoLibraryId")
    video_guid = payload.get("VideoGuid")
    status = payload.get("Status")

    print(
        f"Video {video_guid} (library {library_id}) -> "
        f"{STATUS.get(status, 'Unknown')} (Status {status})"
    )

    # The event type IS the numeric Status. Dispatch on it.
    if status == 3:  # Finished - encoding done, video is ready to play
        print(f"Encoding finished for {video_guid}")
        # Your code: publish the video, notify users, fetch full metadata via the
        # Stream API: GET /library/{library_id}/videos/{video_guid}

    elif status == 5:  # Failed - encoding failed
        print(f"Encoding failed for {video_guid}")
        # Your code: alert, mark failed, offer re-upload

    elif status == 9:  # CaptionsGenerated
        print(f"Captions generated for {video_guid}")
        # Your code: enable captions, index transcript

    elif status == 10:  # TitleOrDescriptionGenerated
        print(f"AI title/description generated for {video_guid}")
        # Your code: populate metadata fields

    else:
        # 0 Queued, 1 Processing, 2 Encoding, 4 Resolution finished,
        # 6-8 presigned upload lifecycle, 11-13 and 32-33
        print(f"Unhandled status: {status}")

    # Return 200 to acknowledge receipt.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
