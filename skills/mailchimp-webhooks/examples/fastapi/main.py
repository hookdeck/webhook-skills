# Generated with: mailchimp-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hmac
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()


def verify_mailchimp_secret(provided: str, expected: str) -> bool:
    """
    Timing-safe compare of the ?secret= query param against the stored secret.

    Mailchimp does NOT sign its webhooks — there is no HMAC or signature header.
    Secure the endpoint by registering the webhook URL with an unguessable
    secret in the query string and validating it here on every POST.
    """
    if not provided or not expected:
        return False
    return hmac.compare_digest(provided, expected)


def parse_form_data(form) -> dict:
    """
    Parse Mailchimp's form body (bracket notation) into a nested dict.
    "data[merges][FNAME]=x" -> {"data": {"merges": {"FNAME": "x"}}}
    """
    result: dict = {}
    for raw_key in form:
        value = form[raw_key]
        path = raw_key.replace("]", "").split("[")
        node = result
        for key in path[:-1]:
            if not isinstance(node.get(key), dict):
                node[key] = {}
            node = node[key]
        node[path[-1]] = value
    return result


# Mailchimp's URL-validation ping is a GET — respond 200 so the webhook saves.
# Do not require the secret here; it's a liveness check, not a data delivery.
@app.get("/webhooks/mailchimp")
async def mailchimp_validate():
    return Response(content="OK", status_code=200)


# Event delivery is a POST with application/x-www-form-urlencoded.
@app.post("/webhooks/mailchimp")
async def mailchimp_webhook(request: Request):
    secret = request.query_params.get("secret", "")
    if not verify_mailchimp_secret(secret, os.environ.get("MAILCHIMP_WEBHOOK_SECRET", "")):
        print("Mailchimp secret verification failed")
        return Response(content="Unauthorized", status_code=401)

    form = await request.form()
    payload = parse_form_data(form)
    event_type = payload.get("type")
    data = payload.get("data") or {}

    try:
        dispatch_mailchimp_event(event_type, data)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Mailchimp event: {err}")
        return Response(content="Server error", status_code=500)

    return Response(content="OK", status_code=200)


def dispatch_mailchimp_event(event_type, data: dict) -> None:
    """Dispatch on the top-level `type` field."""
    if event_type == "subscribe":
        print(f"Subscribe: {data.get('email')} joined list {data.get('list_id')}")
        # TODO: upsert the contact into your CRM/DB
    elif event_type == "unsubscribe":
        # data['action'] is 'unsub' or 'delete'; data['reason'] is 'manual' or 'abuse'
        print(f"Unsubscribe ({data.get('action')}/{data.get('reason')}): "
              f"{data.get('email')} from list {data.get('list_id')}")
        # TODO: suppress the contact / update marketing consent
    elif event_type == "profile":
        print(f"Profile update: {data.get('email')} on list {data.get('list_id')}")
        # TODO: sync updated merge fields (data['merges'])
    elif event_type == "upemail":
        print(f"Email changed: {data.get('old_email')} -> {data.get('new_email')} "
              f"on list {data.get('list_id')}")
        # TODO: re-key the contact by data['new_id'] / data['new_email']
    elif event_type == "cleaned":
        # data['reason'] is 'hard' (bounce) or 'abuse' (spam complaint)
        print(f"Cleaned ({data.get('reason')}): {data.get('email')} on list {data.get('list_id')}")
        # TODO: mark the address undeliverable
    elif event_type == "campaign":
        print(f"Campaign {data.get('id')} \"{data.get('subject')}\" status: {data.get('status')}")
        # TODO: trigger post-send reporting/automation
    else:
        print(f"Unhandled Mailchimp event type: {event_type}")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
