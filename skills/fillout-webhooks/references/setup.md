# Setting Up Fillout Webhooks

## Prerequisites

- A Fillout account and a form you can edit
- A public HTTPS URL for your endpoint (for local development, use the Hookdeck CLI below)
- A random token you generate yourself:

  ```bash
  openssl rand -hex 32
  ```

Fillout never issues a webhook signing secret. The token is yours: you put it in Fillout
and in your server's `FILLOUT_WEBHOOK_TOKEN`.

## How Do I Add a Webhook with an Authorization Header?

1. Open the form in the Fillout editor and click **Integrate** at the top, then
   **Webhook**.
2. Enter your webhook URL, e.g. `https://example.com/webhooks/fillout`.
3. Switch from **Simple** to **Advanced** at the top. Headers are an Advanced option.
4. **HTTP method:** choose `POST`.
5. **Body:** map the keys you need. Add `submissionId` → **Submission ID** so your
   handler can deduplicate, then one key per answer (e.g. `email` → the email question).
   In Advanced mode Fillout sends only what you map here, not the full submission.
6. **Headers:** add a header with key `Authorization` and value `Bearer <your token>`.
7. Click **Test** to send a test request, then **Finish setup**.
8. **Publish** the form. The webhook runs on every new submission.

Set the same token on your server:

```bash
FILLOUT_WEBHOOK_TOKEN=<your token>   # without the "Bearer " prefix
```

## Can I Use Simple Mode?

Yes, if you don't need header authentication. Simple mode sends the full submission
(`submissionId`, `submissionTime`, `questions`, `calculations`, `urlParameters`, and so on)
but has no Headers section, so the examples in this skill reject it with `401`. Options if
you want the full submission and still need to keep strangers out:

- Put Hookdeck in front (see below) and restrict who can reach your origin, or
- Use an unguessable URL path and treat the path itself as the secret. That's weaker:
  URLs end up in logs.

## How Do I Create a Webhook with the REST API?

```bash
curl -X POST "https://api.fillout.com/v1/api/webhook/create" \
  -H "Authorization: Bearer $FILLOUT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"formId": "<public form id>", "url": "https://example.com/webhooks/fillout"}'
```

- The API key comes from **Settings → Developer** (`https://build.fillout.com/home/settings/developer`).
  It's for calling Fillout. Fillout never sends it to you.
- EU accounts use `https://eu-api.fillout.com/v1/api`.
- The request takes only `formId` and `url`. **There's no way to set custom headers**, so
  API-created webhooks arrive without an `Authorization` header.
- API-created webhooks send the full submission object and **don't show in the Fillout
  dashboard**. Remove them with `POST /v1/api/webhook/delete` (body `{ "webhookId": <id> }`).
- The API is rate limited to 5 requests per second per account/API key.

## What Happens When a Delivery Fails?

Fillout shows an error next to the submission on the form's **Results** page. Open the
submission to read the error, fix your endpoint, then click **Retry integration**. If that
button isn't there, resubmit the response. Resubmitting reruns all integrations,
workflows and notifications on the form, not only the webhook.

Fillout doesn't document automatic retries, timeouts, source IPs or a delivery ID header.
Return `2xx` quickly and do slow work asynchronously.

## Local Development

```bash
# Express or Next.js
npx hookdeck-cli listen 3000 fillout --path /webhooks/fillout

# FastAPI
npx hookdeck-cli listen 8000 fillout --path /webhooks/fillout
```

Use the public URL the CLI prints as the webhook URL in Fillout, then click **Test**.

## Using Hookdeck's Fillout Source

Hookdeck's Fillout source type authenticates the header at ingestion. In the source's
verification settings:

- **Header Name:** `Authorization`
- **Header Value:** `Bearer <your token>` (the whole value, including `Bearer `)

The source accepts `POST` only, so keep the Fillout webhook on `POST`.
