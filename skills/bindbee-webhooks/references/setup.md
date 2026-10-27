# Setting Up Bindbee Webhooks

## Prerequisites

- A Bindbee account (Admins and Members can both manage webhooks)
- A public HTTPS endpoint that accepts `POST` and answers `2xx` within 10 seconds

## Get Your Signing Secret

1. Open **Webhooks** in the Bindbee dashboard.
2. On the **Security signature** card, click the eye icon to reveal the secret and copy it.
3. Store it as `BINDBEE_WEBHOOK_SECRET`, **exactly as shown**. It has no prefix and is used as raw UTF-8 bytes. Do not add `whsec_` or base64-encode it.

One organization-wide secret signs every webhook, on both versions. Regenerating it (refresh icon, then **Regenerate it**) invalidates the old one immediately for every webhook, so deploy the new value straight away.

## Register Your Endpoint

1. In **Webhooks**, click **Add webhook**.
2. Enter the destination URL (after the fixed `https://`). **Send test event** sends one `HEAD` request with no body; it reports "Invalid URL" only if your endpoint answers `5xx` or doesn't answer at all.
3. Leave **API Versions** on **Version 2 (2026.10.06)**. The version can't be changed once the webhook exists.
4. Give it a unique **Webhook Name**.
5. Under **Webhook Type**, tick **Production**, **Development** or both.
6. Select events by name (no wildcards): connector changes, and a created and an updated event per data model. Subscribe only to what your handler processes. Recommended starting set: `connector.linked`, `connector.sync.completed`, `connector.sync.failed`, `connector.relink_needed`, plus the models you use (for example `hris.employee.created` and `hris.employee.updated`).
7. Click **Create webhook**.

Bindbee rejects public request-inspection services (`webhook.site`, `webhook-test.com`), URL shorteners and addresses that resolve to private networks ("Url not allowed"). Use your own endpoint, or a tunnel to it while developing: `npx hookdeck-cli listen 3000 bindbee --path /webhooks/bindbee`.

## Hookdeck Event Gateway

Hookdeck has a **Bindbee** source type (`BINDBEE`). Its configuration alert reads exactly: "Paste the security signature secret as-is. Only version 2 webhooks are supported; version 1 webhooks lack the webhook-* headers and fail verification."

Paste the secret from the Security signature card without changes. Create the webhook in Bindbee on version 2; a version 1 webhook will fail verification in Hookdeck and in your own handler alike.

## Test Mode vs Live Mode

Environments are per webhook: a webhook fires only for connectors in the environments you tick, and `connector.environment` (`production` or `development`) on every event says which one. Delivery logs (dashboard **Logs > Webhooks**, or the API) show the final status of each delivery.
