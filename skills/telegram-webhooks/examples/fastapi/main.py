# Generated with: telegram-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI(title="Telegram Webhook Handler")


def verify_telegram_secret_token(header_value: Optional[str], expected: Optional[str]) -> bool:
    """
    Telegram does not sign webhook payloads. Instead, the secret_token passed to
    setWebhook is sent back unchanged in the X-Telegram-Bot-Api-Secret-Token
    header on every request.
    https://core.telegram.org/bots/api#setwebhook
    """
    # Fail closed: no configured secret or no header means reject
    if not header_value or not expected:
        return False
    # Compare bytes: compare_digest raises TypeError on non-ASCII str input
    return hmac.compare_digest(header_value.encode(), expected.encode())


def get_update_type(update: dict) -> Optional[str]:
    """An Update has update_id plus at most one optional field; its name is the update type."""
    return next((key for key in update if key != "update_id"), None)


async def require_telegram_secret(
    x_telegram_bot_api_secret_token: Optional[str] = Header(default=None),
) -> None:
    """Dependency: verify the secret token before the body is parsed."""
    if not verify_telegram_secret_token(
        x_telegram_bot_api_secret_token, os.environ.get("TELEGRAM_WEBHOOK_SECRET")
    ):
        print("Telegram webhook secret token verification failed")
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/telegram", dependencies=[Depends(require_telegram_secret)])
async def telegram_webhook(request: Request):
    try:
        update = json.loads(await request.body())
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(update, dict) or "update_id" not in update:
        raise HTTPException(status_code=400, detail="Invalid update")

    # update_id is stable across retries: use it to skip duplicate deliveries
    update_type = get_update_type(update)
    print(f"Received Telegram update {update['update_id']} ({update_type})")

    if update_type == "message":
        message = update["message"]
        sender = message.get("from") or {}
        text = message.get("text", "[non-text]")
        print(f"Message in chat {message.get('chat', {}).get('id')} from {sender.get('username') or sender.get('id')}: {text}")
        # Reply with sendMessage using TELEGRAM_BOT_TOKEN

    elif update_type == "edited_message":
        message = update["edited_message"]
        print(f"Message {message.get('message_id')} edited in chat {message.get('chat', {}).get('id')}")

    elif update_type == "channel_post":
        post = update["channel_post"]
        chat = post.get("chat", {})
        print(f"Channel post in {chat.get('title') or chat.get('id')}: {post.get('text', '[non-text]')}")

    elif update_type == "callback_query":
        query = update["callback_query"]
        print(f"Callback query {query['id']} from {query.get('from', {}).get('id')}: {query.get('data')}")
        # Telegram clients show a spinner until answerCallbackQuery is called.
        # A webhook can make one Bot API call by returning it as the response.
        return JSONResponse({"method": "answerCallbackQuery", "callback_query_id": query["id"]})

    elif update_type == "inline_query":
        query = update["inline_query"]
        print(f"Inline query {query.get('id')} from {query.get('from', {}).get('id')}: \"{query.get('query')}\"")
        # Answer with answerInlineQuery

    elif update_type == "my_chat_member":
        member = update["my_chat_member"]
        status = member.get("new_chat_member", {}).get("status")
        print(f"Bot status in chat {member.get('chat', {}).get('id')} is now {status}")

    else:
        print(f"Unhandled update type: {update_type}")

    # Any 2XX acknowledges the update; other statuses make Telegram retry
    return Response(status_code=200)


if __name__ == "__main__":
    import uvicorn

    if not os.environ.get("TELEGRAM_WEBHOOK_SECRET"):
        print("Warning: TELEGRAM_WEBHOOK_SECRET is not set; all webhook requests will be rejected")
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
