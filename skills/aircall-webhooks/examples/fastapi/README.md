# Aircall Webhooks - FastAPI Example

Minimal example of receiving Aircall webhooks in FastAPI, verifying the shared-secret
`token` field carried in the request body.

> **Aircall does not sign webhooks.** There is no signature header and no HMAC.
> Verification is a constant-time comparison of the body's `token` against the token issued
> when the webhook was created.

Aircall publishes no Python SDK for webhooks — and none is needed. There is nothing
cryptographic to verify, so `secrets.compare_digest` from the standard library is the
complete implementation.

## Prerequisites

- Python 3.9+
- An Aircall account with a webhook created (Dashboard or `POST /v1/webhooks`)
- The webhook's `token`

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Aircall webhook token to `.env` as `AIRCALL_WEBHOOK_TOKEN`.

   Get it from the create-webhook response:
   ```bash
   curl -X POST https://api.aircall.io/v1/webhooks \
     -u "$AIRCALL_API_ID:$AIRCALL_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "custom_name": "FastAPI example",
       "url": "https://your-public-url.example.com/webhooks/aircall",
       "events": ["call.created", "call.answered", "call.ended"]
     }'
   ```
   The response contains `webhook.token`. If you created the webhook from the Dashboard
   (which does not display the token), fetch it with
   `GET https://api.aircall.io/v1/webhooks/{webhook_id}`.

## Run

```bash
python main.py
```

Or with uvicorn directly:

```bash
uvicorn main:app --reload --port 8000
```

Server runs on `http://localhost:8000`.

Webhook endpoint: `POST http://localhost:8000/webhooks/aircall`

## Test

Run the test suite:

```bash
pytest test_webhook.py -v
```

Send a webhook by hand — the token is just a body field, so no signing is needed:

```bash
curl -X POST http://localhost:8000/webhooks/aircall \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "call",
    "event": "call.created",
    "timestamp": 1732622896,
    "token": "df76g76dpziygs567f0",
    "data": { "id": 123, "direction": "inbound", "status": "initial", "raw_digits": "+1 800-123-4567" }
  }'
```

To receive real Aircall webhooks locally, use the Hookdeck CLI (no account, no install —
and it provides the HTTPS URL Aircall requires):

```bash
npx hookdeck-cli listen 8000 aircall --path /webhooks/aircall
```

Then set the printed public URL as the webhook's `url` in Aircall. Trigger events by
placing a call to one of your Aircall numbers — Aircall has no test-event button.

## Implementation Notes

- **`secrets.compare_digest`** for constant-time comparison. Unlike Node's
  `crypto.timingSafeEqual`, it handles differing lengths without raising.
- **No raw body needed.** For HMAC providers you must read `await request.body()` before
  parsing; Aircall's secret is a field *inside* the JSON, so `await request.json()` is
  correct and sufficient.
- **`BackgroundTasks`** runs event handling after the response is sent, keeping the
  handler inside Aircall's 5-second timeout.

## Events Handled

Dispatch is on the `event` name, covering these 67 Aircall events (the 11 added since,
`conversation.*`, `whatsapp_username_message.*`, `outbound_campaign.*` and
`ai_messaging_agent.*`, fall through to the default branch):

- **Call** (19) — `call.created`, `call.ringing_on_agent`, `call.agent_declined`,
  `call.answered`, `call.transferred`, `call.external_transferred`,
  `call.unsuccessful_transfer`, `call.hungup`, `call.ended`, `call.hold`, `call.unhold`,
  `call.ivr_option_selected`, `call.comm_assets_generated`, `call.voicemail_left`,
  `call.assigned`, `call.archived`, `call.tagged`, `call.untagged`, `call.commented`
- **User V2** (8, preferred) — `user.created.v2`, `user.deleted.v2`, `user.connected.v2`,
  `user.disconnected.v2`, `user.opened.v2`, `user.closed.v2`, `user.wut_start.v2`,
  `user.wut_end.v2`
- **User V1** (8, deprecated) — same names without `.v2`
- **Number** (4) — `number.created`, `number.opened`, `number.closed`, `number.deleted`
- **Contact** (3) — `contact.created`, `contact.updated`, `contact.deleted`
- **Message** (6) — `message.sent`, `message.received`, `message.status_updated`,
  `group_message.sent`, `group_message.received`, `group_message.status_updated`
- **Conversation Intelligence** (12) — `transcription.created`, `summary.created`,
  `topics.created`, `sentiment.created`, `action_item.created`, `playbook_result.created`,
  `playbook_result.updated`, `realtime_transcription.utterances_received`,
  `custom_summary.result_created`, `custom_summary.result_updated`,
  `call_evaluation.created`, `call_evaluation.updated`
- **AI Voice Agent** (4) — `ai_voice_agent.started`, `ai_voice_agent.ended`,
  `ai_voice_agent.escalated`, `ai_voice_agent.summary`
- **Analytics** (2) — `analytics.report_created`, `analytics.report_failed`
- **Integration** (1) — `integration.deleted`

Unknown events return 200 and are logged, so new Aircall events never trip the
auto-disable counter.

## Security

- Body `token` compared with `secrets.compare_digest` (constant time)
- Returns `401` on a missing or wrong token, `400` on malformed JSON or a missing `event`
- Verification runs **before** any envelope validation or processing
- HTTPS is mandatory in production: the token travels in cleartext

## Aircall Delivery Behavior This Example Accounts For

- **Responds 200 immediately**, processing via `BackgroundTasks` — Aircall times out after
  **5 seconds**
- **Idempotent-friendly**: delivery is at-least-once and **unordered**; key call records on
  `data["id"]` and upsert
- **Avoids non-2xx responses** for unknown events and handler errors — Aircall retries a
  failure up to **50 times**, then disables the webhook (re-enabling automatically if a
  retry succeeds within 12 hours)
