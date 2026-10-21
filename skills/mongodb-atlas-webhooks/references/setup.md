# Setting Up MongoDB Atlas Webhooks

## Prerequisites

- Atlas **Organization Owner** or **Project Owner** access
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 mongodb-atlas --path /webhooks/mongodb-atlas` for local development)

## Get Your Signing Secret

You choose the secret yourself; Atlas does not generate one.

1. In Atlas, open **Project Settings** (select the organization and project, then the icon next to **Project Overview**).
2. Open the **Integrations** tab and click **Configure** for **Webhook Settings**.
3. Enter a **Webhook Secret** (optional, but required if you want `X-MMS-Signature`).
4. Store it as `MONGODB_ATLAS_WEBHOOK_SECRET`.

## Register Your Endpoint

1. In Webhook Settings, enter the **Webhook URL**.
2. Optionally set the **Webhook Headers Template** and **Webhook Body Template** (FreeMarker; syntax is validated on save). A custom body template changes the payload.
3. Click **Save**.
4. Configure alert notifications (project alert settings) and add **Webhook** as a notification method.

## Authentication Without a Secret

Atlas does not send the secret as a credential. If you skip the secret, protect the endpoint with a token in the URL query string (`https://example.com/webhook?token=...`), an Atlas IP access list, or a reverse proxy.

## Testing

Atlas provides no manual test alert. Create a temporary alert with an easy-to-trigger condition (for example a low disk space threshold on a test cluster), then delete it. Check the **Activity Feed** for delivery errors.
