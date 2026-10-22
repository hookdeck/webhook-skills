# Setting Up Braze Webhooks

## Prerequisites

- A Braze workspace
- "Manage App Group" permission to create credentials; "Edit Campaigns", "Edit Canvases" or "Edit
  Webhook Templates" to select one
- A publicly reachable **HTTPS** endpoint with a fixed hostname (use `npx hookdeck-cli listen 3000
  braze --path /webhooks/braze` locally)

## Create a Basic Authentication Credential

1. Go to **Settings > Credential Management**.
2. Add a credential and choose **Basic authentication**.
3. Enter a unique name, the username and password, and the **allowed domain** (the webhook's
   hostname; it includes all subdomains, so use the most specific hostname you control).
4. Store the same username and password as `BRAZE_WEBHOOK_USERNAME` and `BRAZE_WEBHOOK_PASSWORD`.

Credentials belong to one workspace: create one in each workspace (development, staging,
production) that needs it. A basic credential without an allowed domain isn't available in the
webhook selector.

## Create the Webhook

1. Create a **webhook campaign**, or add a **Webhook** step to a Canvas, or use a webhook template.
2. In the **Compose** tab, enter the webhook URL, for example
   `https://example.com/webhooks/braze`. It must use a fixed hostname to select a credential
   (Liquid is allowed in the path and query).
3. Choose the **HTTP method** (POST in most cases).
4. In **Credential**, select the saved credential. Braze then sends
   `Authorization: Basic base64(username:password)`.
5. Write the **request body** as JSON key-value pairs or raw text.
6. Switch to the **Test** tab and send a test webhook. The test send uses the credential.
7. Finish the schedule, audience and conversion settings, then launch.

If the hostname comes from Liquid or a Content Block you can't pick a credential. Keep
authentication in **Request headers** instead (not covered by this skill). The webhook preview
omits the credential's authentication header, so don't expect to see it there.

## Test with curl

```bash
curl -X POST http://localhost:3000/webhooks/braze \
  -u "$BRAZE_WEBHOOK_USERNAME:$BRAZE_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"message_body":"Your order just arrived!","user_id":"u_123"}'
```

## Network Notes

Braze publishes outbound IP addresses per cluster (see its IP allowlisting section), which you
can allowlist as an extra layer. They are not a substitute for the credential check. A `403` from
your edge or firewall usually means those IPs are blocked.
