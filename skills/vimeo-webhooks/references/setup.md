# Setting Up Vimeo Webhooks

## Prerequisites

- A Vimeo developer account and an app at [developer.vimeo.com/apps](https://developer.vimeo.com/apps)
- The `CAPABILITY_WEBHOOK_SCOPE` capability on the app, which lets its access tokens use the `webhooks` scope
- An access token for the app with the `public`, `private`, `edit`, `delete` and `webhooks` scopes (Vimeo's stated prerequisite; webhooks fire only for app users whose token has the `webhooks` scope)
- Your application's public webhook endpoint URL (use the Hookdeck CLI for local testing)

Vimeo app webhooks are managed through the API; there is no dashboard screen for them.

## Create a Webhook With a Secret

Set a secret on the webhook through the Vimeo API. Without one, deliveries are unsigned (no `X-Webhook-Signature` header) and fail verification. Vimeo recommends a random string of at least 64 bytes:

```bash
SECRET=$(openssl rand -hex 64)

curl -X POST "https://api.vimeo.com/apps/$APP_ID/webhooks" \
  -H "Authorization: bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/vnd.vimeo.*+json;version=3.4" \
  -d "{
    \"is_enabled\": true,
    \"webhook_url\": \"https://example.com/webhooks/vimeo\",
    \"webhook_type\": \"video-transcode-complete\",
    \"secret\": \"$SECRET\"
  }"
```

Always send the `Accept: application/vnd.vimeo.*+json;version=3.4` header. Only one webhook per event type is allowed per app, so repeat the request for each `webhook_type` you need (all can use the same secret).

Store the value as `VIMEO_WEBHOOK_SECRET`.

## Add or Change a Secret on an Existing Webhook

```bash
curl -X PATCH "https://api.vimeo.com/apps/$APP_ID/webhooks/$WEBHOOK_ID" \
  -H "Authorization: bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/vnd.vimeo.*+json;version=3.4" \
  -d "{\"secret\": \"$SECRET\"}"
```

To read a secret back: `GET /apps/{app_id}/webhooks/{webhook_id}?fields=secret`.

## Other Webhook Endpoints

| Action | Request |
|--------|---------|
| List webhooks | `GET /apps/{app_id}/webhooks` |
| Get one | `GET /apps/{app_id}/webhooks/{webhook_id}` |
| Update (e.g. disable with `is_enabled: false`) | `PATCH /apps/{app_id}/webhooks/{webhook_id}` |
| Delete | `DELETE /apps/{app_id}/webhooks/{webhook_id}` (returns `204`) |

## Using Hookdeck

Create a Vimeo source in Hookdeck and give it the same `secret` you set on the webhook. Point each Vimeo webhook's `webhook_url` at the Hookdeck source URL. If you skip the secret, deliveries are unsigned and fail verification in Hookdeck, so set one through the Vimeo API first.

Local testing:

```bash
npx hookdeck-cli listen 3000 vimeo --path /webhooks/vimeo
```

## Testing

Trigger a real event (for example, upload and delete a test video) with the webhook enabled. Vimeo documents no test-delivery tool.
