# Setting Up Speechmatics Webhooks

## Prerequisites

- A Speechmatics account and API key
- A public HTTPS URL for your endpoint. During development, tunnel to localhost:

```bash
npx hookdeck-cli listen 3000 speechmatics --path /webhooks/speechmatics
```

(Use port `8000` for the FastAPI example.)

## 1. Choose an Auth Header

There is no dashboard setting and no signing secret: notifications are configured per job. Pick
a header and generate a secret value:

```bash
openssl rand -hex 32
```

Put the header name and the **exact, whole header value** in your app's `.env`. If you use
`Authorization: Bearer <token>`, the value includes `Bearer `:

```bash
SPEECHMATICS_WEBHOOK_HEADER=Authorization
SPEECHMATICS_WEBHOOK_SECRET="Bearer <the value you generated>"
```

This is your receiver's token, not the Speechmatics API key.

## 2. Submit a Job with a Notification

Add `notification_config` to the job config. Each `auth_headers` entry is a `Name: value` string:

```bash
curl -L -X POST "$SPEECHMATICS_BATCH_API_URL/jobs/" \
  -H "Authorization: Bearer $SPEECHMATICS_API_KEY" \
  -F data_file=@example.wav \
  -F config='{
    "type": "transcription",
    "transcription_config": { "language": "en" },
    "notification_config": [
      {
        "url": "https://your-app.example.com/webhooks/speechmatics",
        "contents": ["jobinfo"],
        "auth_headers": ["Authorization: Bearer <the value you generated>"]
      }
    ]
  }'
```

| Option | Required | Notes |
|--------|----------|-------|
| `url` | yes | Up to 3 URLs per job |
| `auth_headers` | no | Free-form `Name: value` strings sent with the request |
| `contents` | no | `transcript`, `transcript.json-v2`, `transcript.txt`, `transcript.srt`, `data`, `jobinfo` |
| `method` | no | `POST` (default) or `PUT` |

`SPEECHMATICS_BATCH_API_URL` is the batch API base URL for your account and region; see the
Speechmatics batch API reference. Submit with whichever client you already use (the API, an SDK or
the portal's config JSON): only the `notification_config` block matters here.

## 3. Handle the Delivery

When the job finishes, Speechmatics sends `POST <url>?id=<job id>&status=success` with your
header attached. Respond with a 2xx once you've accepted it.

## Testing

Submit a short audio file with `"contents": ["jobinfo"]` and watch the delivery in the Hookdeck
CLI web UI. Each job needs its own `notification_config`, so the header is only sent on jobs
that set it.

## Optional: Allowlist the Egress IPs

Speechmatics publishes the egress IPs per region (EU1, EU2, US1, US2, AU1) on its notifications
page. Allowlisting them is an extra layer, not a replacement for the header check.
