# Setting Up Taiga Webhooks

## Prerequisites

- A Taiga project where you are an admin
- A public HTTPS URL for your endpoint (for local development, use the Hookdeck CLI below)
- Self-hosted only: access to the `taiga-back` settings

## How Do I Enable Webhooks on a Self-Hosted Taiga?

Add this to `~/taiga-back/settings/local.py` and restart taiga-back:

```python
WEBHOOKS_ENABLED = True
```

Optionally block webhook calls to private and reserved addresses (this also blocks `localhost` targets):

```python
WEBHOOKS_BLOCK_PRIVATE_ADDRESS = True
```

Hosted Taiga needs no setting.

## How Do I Get a Public URL for Local Development?

```bash
npx hookdeck-cli listen 3000 taiga --path /webhooks/taiga
```

Use `8000` instead of `3000` for the FastAPI example. The CLI prints a public URL that forwards to `http://localhost:3000/webhooks/taiga`. No account is required.

## How Do I Register a Webhook?

1. Open your project's admin settings and find the **Webhooks** section (under Integrations in current Taiga versions).
2. Add a webhook: give it a name, the endpoint URL, and a **secret key**.
3. Save, then use the test action on the webhook to send a `test` payload.

The secret key is the HMAC key. Store it as `TAIGA_WEBHOOK_SECRET`.

## Test Mode

The test action sends `{"action": "test", "type": "test", "data": {"test": "test"}}`, signed like any other delivery.
