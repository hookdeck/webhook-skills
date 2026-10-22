# Setting Up PostHog Webhooks

## Prerequisites

- PostHog account (Cloud or self-hosted) with access to Data pipelines
- A public HTTPS endpoint (or a Hookdeck URL) for your receiver

## Generate Your Signing Secret

PostHog does not generate the secret; you choose it.

```bash
echo "whsec_$(openssl rand -base64 32)"
```

- Keep the `whsec_` prefix. PostHog accepts a bare base64 secret too, but Hookdeck's Standard Webhooks verification does not.
- It must decode to at least 24 bytes (32 random bytes is fine).
- Paste the **same string** into PostHog, your receiver's `POSTHOG_WEBHOOK_SECRET`, and/or the Hookdeck source.

## Register Your Endpoint

1. In PostHog, go to **Data pipelines → Destinations → New destination**.
2. Choose **HTTP Webhook**.
3. Set **Webhook URL** to your endpoint, e.g. `https://example.com/webhooks/posthog` (or your Hookdeck source URL).
4. Paste the secret into **Signing secret**.
5. Optionally edit the **JSON Body** (default `{event, person}`) and headers. Put credentials in **Secret headers**.
6. Set filters for the events to send (e.g. `$pageview`, `$identify`, or a custom event) and save.
7. Use the destination's test option to send a sample event.

## Test Mode vs Live Mode

There is no separate test mode. Use the destination's test function, or enable debug to log the request and response.

## Local Development

```bash
npx hookdeck-cli listen 3000 posthog --path /webhooks/posthog
```
