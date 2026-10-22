# Setting Up PropelAuth Webhooks

## Prerequisites

- A PropelAuth project with access to the Dashboard
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI tunnel for local development)

## Register Your Endpoint

1. In the PropelAuth Dashboard, open **Integrations**, then **Webhooks**.
2. Add an endpoint URL for the environment you're configuring (for example `https://example.com/webhooks/propelauth`).
3. Subscribe to the events you need, for example `user.created`, `user.updated`, `user.deleted`, `org.created`, and `user.added_to_org`.

## Get Your Signing Secret

Open your endpoint in the webhooks page and copy its signing secret. It starts with `whsec_`.
Store it as `PROPELAUTH_WEBHOOK_SECRET`.

## Test vs Production

Set up separate endpoints for your test and production environments. Each endpoint has its own
secret, so keep one environment variable per environment and don't reuse a test secret in production.

## Local Development

```bash
# Express or Next.js
npx hookdeck-cli listen 3000 propelauth --path /webhooks/propelauth

# FastAPI
npx hookdeck-cli listen 8000 propelauth --path /webhooks/propelauth
```

Paste the tunnel URL into a test endpoint, then trigger an event such as signing up a test user.

## Responding to Deliveries

Return a `2xx` quickly after verifying. Svix retries failed deliveries and sends the same
`svix-id` each time, so deduplicate on it.
