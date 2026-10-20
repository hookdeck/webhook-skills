# Generated with: reducto-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Reducto Webhook Handler")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/webhooks/reducto")
async def reducto_webhook(
    request: Request,
    svix_id: str | None = Header(None),
    svix_timestamp: str | None = Header(None),
    svix_signature: str | None = Header(None),
):
    """Receive and verify a Reducto webhook (delivered via Svix)."""
    if not all([svix_id, svix_timestamp, svix_signature]):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    secret = os.environ.get("REDUCTO_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("Invalid webhook secret configuration")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Verify against the RAW body — never a re-serialized payload.
    body = await request.body()
    try:
        # The SDK enforces the 5-minute tolerance and checks every signature in
        # constant time. As of svix 2.x it returns None, so parse separately below.
        Webhook(secret).verify(
            body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except WebhookVerificationError as err:
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        print(f"Webhook verification failed: {err}")
        raise HTTPException(status_code=400, detail=detail)

    # Verified — only now is it safe to parse.
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Reducto sends one Svix event type (async.update); branch on job status.
    status = payload.get("status")
    job_id = payload.get("job_id")
    metadata = payload.get("metadata", {})

    print(f"Received Reducto webhook: job {job_id} {status} (svix-id {svix_id})")

    if status == "Completed":
        # Results are not in the webhook — fetch them with the Reducto API,
        # e.g. client.job.get(job_id). Respond within 15s; queue heavy work.
        print(f"Job completed: {job_id} metadata={metadata}")
    elif status == "Failed":
        print(f"Job failed: {job_id} metadata={metadata}")
    else:
        print(f"Unhandled job status: {status}")

    return JSONResponse(
        content={"received": True, "status": status, "job_id": job_id},
        status_code=200,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
