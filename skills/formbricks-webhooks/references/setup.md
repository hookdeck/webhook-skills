# Setting Up Formbricks Webhooks

## Prerequisites

- A Formbricks account (cloud or self-hosted)
- Your application's public HTTPS webhook URL (use the Hookdeck CLI for local development)

## How Do I Create a Webhook?

**UI:**

1. In Formbricks open **Configuration** in the left sidebar, then the **Integrations** tab.
2. Click **Manage Webhooks**, then **Add Webhook**.
3. Enter your endpoint URL and click **Test Endpoint**. It must be reachable and accept `POST` requests before you can save.
4. Pick the triggers (`responseCreated`, `responseUpdated`, `responseFinished`) and the surveys to listen to.
5. Save. The signing secret is displayed right away.

**API:** use the create, list and delete endpoints of the Webhook API in the [API v2 reference](https://formbricks.com/docs/api-v2-reference/management-api-%3E-webhooks/get-webhooks). The creation response contains the signing secret.

Webhooks belong to one environment, so a development and a production environment need separate webhooks and separate secrets.

## Where Is My Signing Secret?

Formbricks generates a unique secret for each webhook when you create it. It has the Standard Webhooks format: `whsec_` followed by a base64-encoded random value. Copy the full value, prefix included, into `FORMBRICKS_WEBHOOK_SECRET`. You can view it again later in the webhook settings. Keep it out of client-side code and version control.

## Why Is There No `webhook-signature` Header?

Hookdeck's configuration alert for this source reads: "Webhooks created before Formbricks added signing have no secret and are unsigned. If yours has no secret, create a new webhook."

`webhook-signature` is sent only if a secret is configured. Webhooks created before signing shipped may have no secret and send unsigned requests. New webhooks always get one, so create a new webhook, switch the triggers and surveys over, and delete the old one. A handler that verifies signatures rejects unsigned deliveries.

## How Do I Test an Endpoint?

Use **Test Endpoint** in the webhook form to check reachability. For real events, submit a response to a survey the webhook covers. To keep unwanted test responses out of production workflows, use a separate test survey in a test environment.

**Local tunnel without an account:**

```bash
# Express / Next.js (use 8000 for FastAPI)
npx hookdeck-cli listen 3000 formbricks --path /webhooks/formbricks
```

Use the printed URL as the webhook URL.

## Self-Hosting Notes

- Formbricks blocks webhook URLs that point to private or internal addresses (`localhost`, `192.168.x.x`, `10.x.x.x`) to prevent SSRF. On a trusted self-hosted instance only, set `DANGEROUSLY_ALLOW_WEBHOOK_INTERNAL_URLS=1` to allow them.
- `WEBHOOK_DELIVERY_TIMEOUT_MS` changes the 5-second delivery timeout.

## IP Allowlists

Formbricks Cloud does not document a fixed IP list. Always verify `webhook-signature` instead of allowlisting.
