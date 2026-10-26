# Setting Up Vern Webhooks

## Prerequisites

- A Vern account with a workbook you can export
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Vern Webhook Endpoint?

Webhook delivery is powered by [Svix](https://www.svix.com), and endpoints are managed in an
embedded Svix portal.

1. In Vern, go to **Settings > Webhooks**. This opens the Svix portal.
2. Click **Add endpoint** and paste the URL your app listens on, e.g.
   `https://example.com/webhooks/vern`.
3. Subscribe to `workbook.production.export` and/or `workbook.preview.export`.
4. Save.

The next time you export a workbook with the **Webhook** option, the matching endpoint receives
the payload. There is no verification challenge.

Configure separate endpoints for preview and production, for example
`/webhooks/vern-preview` and `/webhooks/vern`. The payload doesn't say which event it came from,
so the endpoint is the only way to tell them apart.

## Where Do I Find the Signing Secret?

Open your endpoint in the Svix portal and copy its signing secret. Vern's page doesn't print an
example value, but Svix endpoint secrets look like `whsec_...`. Store the full value, prefix
included:

```bash
VERN_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

Each endpoint has its own secret. If the value doesn't start with `whsec_`, the examples reject
it with a 500 instead of verifying with the wrong key.

## How Do I Test Without an Endpoint?

The Svix portal offers **Svix Play**, a temporary URL that catches and displays payloads in a web
UI. Use it to prove an export fires before your real endpoint is wired up. For a local
handler, run `npx hookdeck-cli listen 3000 vern --path /webhooks/vern` and add the tunnel URL as
an endpoint.

## Watching and Replaying Deliveries

From the Svix portal you can see every delivery to each endpoint, inspect the exact payload,
replay failed deliveries, and copy the signing secret.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Every delivery fails verification | The handler verifies a re-serialized body instead of the raw bytes, or the secret belongs to a different endpoint |
| No deliveries arrive | The endpoint isn't subscribed to the event you expect, or the export wasn't run with the **Webhook** option |
| Test data shows up in production | Preview and production exports share one endpoint: use separate endpoints |
| The same batch arrives twice | A retry after a slow response: deduplicate on `svix-id` |
