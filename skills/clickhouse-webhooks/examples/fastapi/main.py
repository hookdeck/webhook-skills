# Generated with: clickhouse-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_clickhouse_request(headers, env=None) -> bool:
    """ClickStack Generic alert webhooks are not signed. Authentication is a secret header
    you added under "Webhook headers". The header name is user-chosen
    (CLICKHOUSE_WEBHOOK_HEADER, default Authorization); the expected value is the exact,
    whole header value in CLICKHOUSE_WEBHOOK_SECRET (any "Bearer " prefix included, not parsed).

    A static credential authenticates the sender, not the body, and gives no replay protection.
    """
    env = os.environ if env is None else env
    secret = env.get("CLICKHOUSE_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    name = env.get("CLICKHOUSE_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(name)  # Starlette headers are case-insensitive
    if not received:
        return False
    # Compare bytes: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


async def require_clickhouse_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read."""
    if not verify_clickhouse_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


# The body is a template you write.
# Illustrative: {"title": "{{title}}", "body": "{{body}}", "link": "{{link}}"}
# Anything that isn't a JSON object is handled as plain text.
def parse_alert(raw: bytes) -> dict:
    text = raw.decode("utf-8", errors="replace")
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    return {"body": text}


def handle_alert(alert: dict) -> None:
    title = alert.get("title") or "(no title)"
    body = alert.get("body") or ""
    link = alert.get("link") or ""
    print(f"ClickStack alert: {title} - {body} {link}".strip())
    # TODO: page on-call, open a ticket, or post to chat. Alerts can repeat on every evaluation.


@app.post("/webhooks/clickhouse", dependencies=[Depends(require_clickhouse_secret)])
async def clickhouse_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        handle_alert(parse_alert(raw_body))
    except Exception as err:  # noqa: BLE001
        print(f"Error handling ClickStack alert: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
