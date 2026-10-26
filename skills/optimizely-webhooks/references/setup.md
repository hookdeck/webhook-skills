# Setting Up Optimizely Webhooks

## Prerequisites

- An Optimizely Feature Experimentation project and permission to manage its settings
- A publicly reachable HTTPS endpoint (locally: `npx hookdeck-cli listen 3000 optimizely --path /webhooks/optimizely`)

## Get Your Secret Token

1. Open your project's **Settings → Webhooks** and create a webhook.
2. Enter your endpoint URL and select the events you want (the datafile update and/or the change-history entity/action pairs).
3. When the webhook is created, Optimizely generates a secret token. **You can view it only once**, immediately after creation. Copy it into `OPTIMIZELY_WEBHOOK_SECRET`. If you lose it, create a new webhook.

## Register Your Endpoint

Point the URL at your handler route, for example `https://example.com/webhooks/optimizely`. Deliveries are `POST` requests with a JSON body and an `X-Hub-Signature: sha1=<hex>` header.

## Test

Publish a change to an environment to trigger `project.datafile_updated`, or make a change that matches a selected entity/action pair. Use the Hookdeck CLI to inspect and replay the request.

## Retries

The Optimizely docs do not document timeouts or retries. Return `200` promptly.
