# Setting Up Incode Webhooks

## Prerequisites

- An Incode account with access to the Dashboard
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 incode --path /webhooks/incode` locally)

## How Do I Authenticate Incode Webhooks?

Add a custom header in Dashboard > Configuration > Webhooks and enter it here. Incode retries unless it gets a 200 with a JSON content type, or a 204, so keep any custom source response JSON.

(This is the setup note Hookdeck shows for its Incode source, type `INCODE`: *Header Name* and
*Header Value* are the custom header you create below.)

## Add the Custom Header

1. In the dashboard's left menu, click **Configuration**, then the **Webhooks** tab.
2. Under **Webhook Custom Headers**, click the plus sign (+) and enter a **Custom Header Key**
   (for example `X-Incode-Auth`) and a **Custom Header Value** (a long random secret).
3. Click **Update Settings**.

Incode sends every custom header on **every** webhook (all headers go to all webhooks), and
dynamic values are not supported. Store the key as `INCODE_WEBHOOK_HEADER` and the value as
`INCODE_WEBHOOK_SECRET`. The value is compared whole, so if you typed `Bearer abc123`, the
secret is `Bearer abc123`.

Leave the OIDC fields (**Authentication URL**, **Client ID**, **Secret Key**, **Scopes**) empty.
OIDC authorization sends a rotating `Authorization: Bearer <ACCESS_TOKEN>` and is not covered by
this skill or by Hookdeck's Incode source.

## Register Your Endpoint

1. On the same tab, scroll down and click **Generate New**.
2. Enter a **Name**, choose the **Type** (for example Session Succeeded, Session Failed,
   Onboarding Status Webhook URL) and enter the **URL**, e.g.
   `https://example.com/webhooks/incode`.
3. Save. Repeat for each webhook type you want; each type has exactly one URL, so you can point
   them all at the same endpoint.

## Respond With JSON

Return `200` with `Content-Type: application/json` (for example `{"success": true}`) or `204`.
Anything else, or a timeout, triggers retries.

## Test

Use the demo environment, or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/incode \
  -H "Content-Type: application/json" \
  -H "X-Incode-Auth: $INCODE_WEBHOOK_SECRET" \
  -d '{"event_type":"SESSION_SUCCEEDED","interviewId":"664283755e0f8e1b87fcc2ce"}'
```

## Network Notes

Incode publishes the source IPs it uses per region (US, EU, Canada, and a separate demo
environment); see the [webhooks overview](https://developer.incode.com/general-reference/webhooks-overview).
The list changes, so treat an allowlist as an extra layer, not the only check.
