# Setting Up Documenso Webhooks

## Prerequisites

- A Documenso **team** account (personal accounts can't use webhooks), on
  [documenso.com](https://documenso.com) or self-hosted
- A publicly reachable endpoint that accepts POST and returns 2xx within 10 seconds. HTTP and
  HTTPS are accepted (use HTTPS: the secret is sent in a header). Private and loopback addresses
  are rejected.

## Create the Webhook and Set the Secret

1. Click your avatar in the top right and choose **Team settings**.
2. Open the **Webhooks** tab and click **Create Webhook**.
3. Fill in:
   - **Webhook URL**: your endpoint, for example `https://example.com/webhooks/documenso`
   - **Events**: the events to receive (all of them, or just `DOCUMENT_COMPLETED`)
   - **Secret**: a long random value (`openssl rand -hex 32`). It is optional in the UI,
     but **set one**: with no secret, Documenso sends an empty `X-Documenso-Secret` header
     and there is nothing to authenticate with.
4. Save, then store the same value as `DOCUMENSO_WEBHOOK_SECRET` in your app.

## Register Your Endpoint Locally

```bash
npx hookdeck-cli listen 3000 documenso --path /webhooks/documenso
```

Use the printed Hookdeck URL as the **Webhook URL** (Documenso rejects `localhost`).

## Test and Inspect

- Webhook details page > **Test** > pick an event > **Send** dispatches a sample payload.
- Each webhook keeps a log of calls (status, event, response code, request and response
  bodies). From a failed call, **Resend** sends the same payload again.

## Retries

A delivery fails on a non-2xx response, the 10-second timeout, or a request error; redirects
aren't followed, so 3xx also fails. Self-hosted retries depend on `NEXT_PRIVATE_JOBS_PROVIDER`:
local (default) 4 attempts back-to-back, BullMQ 3 with exponential backoff, Inngest 5. The
webhook is never disabled automatically.

## Self-Hosting

Self-hosted instances can deliver to private hostnames by listing them in the comma-separated
`NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS` environment variable.
