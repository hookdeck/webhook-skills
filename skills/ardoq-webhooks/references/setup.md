# Setting Up Ardoq Webhooks

Keep signing on for the Ardoq webhook (it is on by default) and paste its secret, which Ardoq shows only once. Ardoq enables webhooks per organization.

## Prerequisites

- An Ardoq organization with webhooks enabled. Email Ardoq or use the chat in Ardoq's help center to request access.
- An Ardoq **admin** account (only admins can create webhooks).
- An **HTTPS** endpoint URL for your handler. Signed webhooks require HTTPS and Ardoq verifies the TLS certificate. For local development, use `npx hookdeck-cli listen 3000 ardoq --path /webhooks/ardoq` and paste the URL it prints.

## Create the Webhook and Get Your Signing Secret

1. In Ardoq open the main menu → **Preferences** → **Organization settings** → **Settings**, then the **Webhooks** tab.
2. Select **Create Webhook**.
3. Enter a name and the destination URL for Ardoq to `POST` to.
4. Leave the **signing** option on (it is on by default).
5. Copy the secret when it is shown. **Ardoq shows it only once** and will never show it again. Store it as `ARDOQ_WEBHOOK_SECRET`.

### Add a Secret to an Existing Webhook

Open the webhook's menu and select **Add signing secret**. This needs an HTTPS URL; if the webhook uses HTTP, create a new one. Adding signing is one-way, and it narrows the events the webhook delivers (see below).

### Rotate the Secret

If the secret is lost or may be compromised, open the webhook's menu and select **Rotate signing secret**. The current secret stops working immediately, so update `ARDOQ_WEBHOOK_SECRET` right away or verification will fail.

## What the Endpoint Receives

- Every change across the whole organization, unfiltered by workspace or permissions, including confidential fields. Only use an endpoint you trust.
- Signed webhooks deliver only `component`, `reference` and `tag` changes. Field, report, dashboard and survey changes come only on unsigned webhooks.
- There are no deletion events.

## Test the Webhook

Make a small change in your components, such as adding and removing a tag. The request arrives with `X-Ardoq-Signature-256` and `X-Ardoq-Timestamp` headers.

## Hookdeck

In Hookdeck, create a source of type **Ardoq** and paste the signing secret there. Hookdeck verifies `X-Ardoq-Signature-256` over `{X-Ardoq-Timestamp}.{body}` and forwards the request to your handler.
