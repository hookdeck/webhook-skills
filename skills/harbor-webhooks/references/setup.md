# Setting Up Harbor Webhooks

## Prerequisites

- A Harbor project where you are a project administrator
- A public HTTPS endpoint for your webhook receiver (use the Hookdeck CLI locally)

Use the HTTP notify type and paste the Auth Header value exactly as set in Harbor, including any "Bearer " or "Basic " prefix.

## Add a Webhook to a Harbor Project

1. Log in to the Harbor interface, go to **Projects**, select a project, and select **Webhooks**.
2. Select the notify type **HTTP** so the webhook is sent to an HTTP endpoint.
3. Select the payload format, **Default** or **CloudEvents** (offered for the HTTP type). The
   examples handle both.
4. Select the events you want to subscribe to (see [overview.md](overview.md)).
5. Enter the **Endpoint URL** of your listener (for example `https://example.com/webhooks/harbor`).
6. If your listener implements authentication, enter the **Auth Header**. Harbor sends this
   value as the `Authorization` header on every delivery. Enter the complete value, for
   example `Bearer <token>` or `Basic <base64>`.
7. To use HTTPS verification of your endpoint's certificate, select **Verify Remote
   Certificate**.
8. Click **Add**.

Store the Auth Header value exactly as typed, prefix included, as `HARBOR_AUTHORIZATION`.

## Test the Webhook

Harbor can send a real event: push or pull an image in the project (the project must have the
matching event selected), or run a scan. You can also send a manual test:

```bash
curl -X POST http://localhost:3000/webhooks/harbor \
  -H "Content-Type: application/json" \
  -H "Authorization: $HARBOR_AUTHORIZATION" \
  -d '{"type":"PUSH_ARTIFACT","occur_at":1680501893,"operator":"harbor-jobservice","event_data":{"repository":{"repo_full_name":"harbor/alpine"}}}'
```

## Local Testing

```bash
npx hookdeck-cli listen 3000 harbor --path /webhooks/harbor
```

Use the printed URL as the Endpoint URL. For FastAPI, use port `8000`. A Harbor instance must be
able to reach the URL, so a tunnel is needed unless Harbor runs on the same machine.

## Changing or Rotating the Credential

Edit the webhook in Harbor and set a new Auth Header, then update `HARBOR_AUTHORIZATION`. Rotate
it whenever it may have leaked: a static credential has no replay protection.
