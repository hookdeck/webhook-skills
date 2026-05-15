# Setting Up Scrapfly Webhooks

## Prerequisites

- A Scrapfly account ([sign up](https://scrapfly.io))
- A **paid Scrapfly plan**. Webhooks are not available on the FREE plan — its webhook queue size is 0, so no deliveries are ever dispatched even after configuration. Any paid tier enables delivery.
- A publicly reachable webhook endpoint URL (use [Hookdeck CLI](https://hookdeck.com/docs/cli) for local development)

## Create a Webhook in the Scrapfly Dashboard

1. Sign in to your Scrapfly dashboard at [scrapfly.io](https://scrapfly.io).
2. Go to **Webhooks** in the navigation.
3. Click **Create Webhook**.
4. Fill in:
   - **Name** — A short identifier. You will pass this as `webhook_name=<name>` on API calls. Names are scoped per project + environment.
   - **URL** — Your endpoint, e.g. `https://your-app.example.com/webhooks/scrapfly`.
   - **Content Type** — Pick `application/json` (the default; matches this skill's example handlers) or `application/msgpack`. Scrapfly sends this value verbatim on every delivery. It applies to Scrape and Extraction bodies; Screenshot deliveries are raw image bytes either way (see [references/verification.md](verification.md) for details). If you pick `application/msgpack`, swap the JSON parser in the scrape/extraction branches of your handler for a msgpack decoder.
   - (Optional) **Concurrency Limit** and environment / project scoping.
5. Save the webhook. Scrapfly will display a **signing secret** — copy it. The dashboard is the only place this secret is shown.

## Configure the Signing Secret in Your App

Add the secret to your `.env`:

```bash
SCRAPFLY_WEBHOOK_SECRET=<value-from-dashboard>
```

Use it **exactly as shown** in the dashboard. Do not trim, base64-decode, or otherwise transform it — Scrapfly treats it as a raw UTF-8 string.

## Trigger a Delivery

### Scrape / Extraction / Screenshot APIs

Pass `webhook_name` on the API call. Example for the Scrape API:

```bash
curl "https://api.scrapfly.io/scrape?key=$SCRAPFLY_KEY&url=https://web-scraping.dev/products&webhook_name=my-webhook&async=true"
```

The call returns immediately with a `job_uuid`. When the job finishes, Scrapfly POSTs the result to your endpoint with:

- `X-Scrapfly-Webhook-Resource-Type: scrape`
- `X-Scrapfly-Webhook-Job-Id: <job_uuid>`
- `X-Scrapfly-Webhook-Signature: <UPPERCASE_HEX_HMAC_SHA256>`

The same pattern works for `https://api.scrapfly.io/extraction` (resource type `extraction`) and `https://api.scrapfly.io/screenshot` (resource type `screenshot`).

### Crawler API

Attach a webhook to a Crawler job when you submit it. Scrapfly will POST lifecycle events (`crawler_started`, `crawler_url_visited`, ..., `crawler_finished`) to your endpoint. The event name is also in the body's `event` field and in `X-Scrapfly-Crawl-Event-Name`.

## Verify Locally with Hookdeck CLI

No account or install needed:

```bash
# Forward incoming webhooks to your local server
npx hookdeck-cli listen 3000 scrapfly --path /webhooks/scrapfly
```

The CLI prints a public URL — paste that into the **URL** field when creating the webhook in the Scrapfly dashboard. Trigger a job with `async=true&webhook_name=<name>` and watch the request appear in the Hookdeck UI.

## Environments

Scrapfly webhooks are scoped per **project** and **environment**. The delivery includes `X-Scrapfly-Webhook-Env` and `X-Scrapfly-Webhook-Project` headers so you can keep one endpoint for multiple environments.

## Reference

- [Scrape API webhook docs](https://scrapfly.io/docs/scrape-api/webhook)
- [Extraction API webhook docs](https://scrapfly.io/docs/extraction-api/webhook)
- [Screenshot API webhook docs](https://scrapfly.io/docs/screenshot-api/webhook)
