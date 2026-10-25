# Setting Up VideoAsk Webhooks

## Prerequisites

- A VideoAsk account and an API access token (the docs authenticate API calls with
  `Authorization: Bearer <token>` plus an `organization-id` header)
- The `form_id` of the videoask
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 videoask --path /webhooks/videoask` locally)

## Why Use the API?

You can add a webhook in the **Connect** tab of a videoask, but the docs only show custom
headers in the API request (`PUT /forms/{form_id}/webhooks/{tag}`). The docs show `headers` only in the create/update request example, so after
creating the webhook, send a test delivery and confirm the header arrives before relying on it.

## Create the Webhook With a Secret Header

Pick a header name and a long random value, then:

```bash
curl -X PUT "https://api.videoask.com/forms/$FORM_ID/webhooks/my-endpoint" \
  -H "Authorization: Bearer $VIDEOASK_API_TOKEN" \
  -H "organization-id: $VIDEOASK_ORG_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/videoask",
    "event_types": ["form_response", "form_response_transcribed"],
    "headers": { "secret": "open-sesame" }
  }'
```

- The last path segment (`my-endpoint`) is the webhook's `tag`. The same `PUT` updates an existing
  webhook; list tags with `GET /forms/{form_id}/webhooks` (webhooks created in the web UI have
  randomly generated tags).
- `event_types` accepts `form_response`, `form_response_transcribed`, `form_author_message`
  and `form_contact_message`.

Then configure your server with the same values:

```bash
VIDEOASK_WEBHOOK_HEADER=secret        # the key you used in "headers"
VIDEOASK_WEBHOOK_SECRET=open-sesame   # the exact value, including any "Bearer " prefix you typed
```

If you wanted an `Authorization`-style value such as `Bearer abc123`, set the whole string
(`Bearer abc123`) as the secret. The skill compares the full header value and does not parse it.

## Test

Send a test delivery from VideoAsk (or complete a test response) and check your endpoint logs the
event, or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/videoask \
  -H "Content-Type: application/json" \
  -H "secret: $VIDEOASK_WEBHOOK_SECRET" \
  -d '{"event_id":"abc","event_type":"form_response","contact":{"contact_id":"1","answers":[]},"form":{"form_id":"2"}}'
```

## Rotating the Credential

Call the same `PUT` with a new `headers` value, then update `VIDEOASK_WEBHOOK_SECRET`. Do both
close together: requests with the old value return 401 until the server catches up.
