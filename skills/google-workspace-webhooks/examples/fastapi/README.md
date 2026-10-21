# Google Workspace Webhooks - FastAPI Example

Minimal example of receiving Google Workspace push notifications (Drive,
Calendar, Admin SDK Directory) with `X-Goog-Channel-Token` verification.

## Prerequisites

- Python 3.9+
- A Google Cloud project with the Drive, Calendar, or Admin SDK API enabled
- OAuth credentials that can call the `watch` method for your resource

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `GOOGLE_WORKSPACE_CHANNEL_TOKEN` to a random secret (max 256 chars), e.g.
   `openssl rand -hex 32`. Pass the same value as `token` in every watch request.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward Google Workspace notifications to your local server (no account needed)
npx hookdeck-cli listen 8000 google-workspace --path /webhooks/google-workspace
```

Create a watch channel that points at the HTTPS URL the CLI prints, for example
on a Drive file:

```bash
curl -X POST "https://www.googleapis.com/drive/v3/files/$FILE_ID/watch" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": "my-channel-1", "type": "web_hook",
       "address": "https://<your-hookdeck-url>/webhooks/google-workspace",
       "token": "<GOOGLE_WORKSPACE_CHANNEL_TOKEN>"}'
```

Google sends a `sync` notification right away. Edit or trash the file to receive
`update` / `trash` notifications. See
[references/setup.md](../../references/setup.md) for Calendar, Drive changes, and
Admin SDK watch requests.

### Send a test notification with curl

```bash
curl -X POST http://localhost:8000/webhooks/google-workspace \
  -H "X-Goog-Channel-ID: my-channel-1" \
  -H "X-Goog-Channel-Token: $GOOGLE_WORKSPACE_CHANNEL_TOKEN" \
  -H "X-Goog-Resource-ID: ret08u3rv24htgh289g" \
  -H "X-Goog-Resource-State: sync" \
  -H "X-Goog-Message-Number: 1"
```

### Run Unit Tests

```bash
pytest test_webhook.py -v
```

## Endpoint

- `POST /webhooks/google-workspace` — Verifies `X-Goog-Channel-Token`, checks the
  required `X-Goog-*` headers, and dispatches on `X-Goog-Resource-State`
  (`sync`, Drive `add`/`update`/`remove`/`trash`/`untrash`/`change`, Calendar
  `exists`/`not_exists`, Directory `delete`/`undelete`/`makeAdmin`). See `main.py`.

Responses: `200` accepted, `400` missing headers or invalid token, `500` token
not configured.
