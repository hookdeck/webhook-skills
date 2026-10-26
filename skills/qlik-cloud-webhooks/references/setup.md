# Setting Up Qlik Cloud Webhooks

## Prerequisites

- A Qlik Cloud tenant, with tenant admin rights (Administration activity center) or access to Qlik Automate
- A public HTTPS endpoint (not an IP address). For local work use `npx hookdeck-cli listen 3000 qlik-cloud --path /webhooks/qlik-cloud`

## Set a Secret

Set a secret on the Qlik Cloud webhook. Without one, deliveries are unsigned and fail verification.

1. Create or edit the webhook and enter a **secret** (optional in the Qlik UI, required for signed deliveries).
2. The secret must be **32 to 64 characters**.
3. Secrets are **write-once**: once saved they can't be viewed or retrieved, so store it in
   `QLIK_CLOUD_WEBHOOK_SECRET` straight away. To rotate it, edit the webhook and enter a new one.

When a secret is set, Qlik Cloud adds a `qlik-signature` header (hex HMAC-SHA256 of the raw
body). Without one **no signature is sent**.

## Register Your Endpoint

1. In the Administration activity center, open **Webhooks** and click **Create new**.
2. Enter a name and the endpoint URL (HTTPS), and optionally headers and the secret.
3. Optionally tick **Cloud event** (the event payload emitted by the Qlik Cloud Webhooks service). Once enabled and saved it can't be undone.
   Also optional: check certificate revocation, and extra HTTP headers (encrypted ones can't be edited, only replaced).
4. Under **Events**, choose the system events that trigger the webhook: Automation, API, Application,
   Data-integration and User events.
5. Click **Create**.

## HTTP Method and Hookdeck

Qlik Cloud's docs don't name the HTTP method of a delivery. Hookdeck's Qlik Cloud source pre-selects
POST without managing the method (you can change it), so any other method the sender uses must also
be allowed on the source. The examples accept GET, POST, PUT, PATCH and DELETE.

## Testing and Redelivery

- Delivery history is kept for 7 days, and an event can be resent by hand from it. Use that to replay
  an event against a fixed handler.
- No retry policy is documented, so don't rely on Qlik Cloud to redeliver a failed event.
