# Setting Up Hightouch HTTP Request Webhooks

## Prerequisites

- A Hightouch workspace with a model and a source connected
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 hightouch --path /webhooks/hightouch` locally)

## Choose Your Credential

Hightouch doesn't sign requests, so you create the credential yourself. Pick a header name and a
long random value, for example:

| Setting | Example |
|---------|---------|
| Header name (`HIGHTOUCH_WEBHOOK_HEADER`) | `Authorization` (default) or `X-Hightouch-Key` |
| Header value (`HIGHTOUCH_WEBHOOK_SECRET`) | `Bearer 4f1c...` or just `4f1c...` |

`HIGHTOUCH_WEBHOOK_SECRET` must equal the **exact, whole header value** you enter in Hightouch,
including a `Bearer ` prefix if you type one. The handler doesn't strip or interpret prefixes.

## Create the Destination

1. In Hightouch, go to **Destinations** > **Add destination** and select **HTTP Request**.
2. Enter the **Base URL** (e.g. `https://example.com`). Only the base URL is required.
3. Under HTTP headers, add a header with your header name as the key, tick **Secret**, then add
   the value. Hightouch obscures it in the UI and encrypts it in storage.
4. Save the destination. Don't use OAuth mode: it sends rotating access tokens.

## Configure Each Sync Trigger

1. Go to **Syncs** > **Add sync**, pick the model and the HTTP Request destination.
2. Choose the triggers: **Rows added**, **Rows changed**, **Rows removed**. Each is configured
   separately.
3. For each trigger set the **method** and **endpoint path** (e.g. `POST /webhooks/hightouch`
   for added, `PUT` for changed, `DELETE` for removed) and the payload.
4. Optionally enable **A batch of multiple rows** (default size 100) and loop over `rows` in the
   JSON template.
5. Set rate limits, concurrency limits and error handling as needed.

Example payload for Rows added (JSON editor, Liquid):

```
{ "id": "{{row.id}}", "email": "{{row.email}}" }
```

## Test

Use the sync's preview/test run, or replay a request with curl:

```bash
curl -X POST http://localhost:3000/webhooks/hightouch \
  -H "Content-Type: application/json" \
  -H "Authorization: $HIGHTOUCH_WEBHOOK_SECRET" \
  -d '{"id":"cus_123","email":"alice@example.com"}'
```

(Adjust `Authorization` if you used a different header name.)

## Security Notes

- Use HTTPS. The credential is static and travels with every request.
- Rotate it if it leaks: change the header value in Hightouch and `HIGHTOUCH_WEBHOOK_SECRET`
  together.
