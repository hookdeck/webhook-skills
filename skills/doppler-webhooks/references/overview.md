# Doppler Webhooks Overview

## What Are Doppler Webhooks?

Doppler is a secrets manager. A project webhook sends an HTTP `POST` to your URL when secrets change in the configs you select. The usual use is triggering a CI/CD pipeline or restarting and redeploying an app so it picks up new secrets. Delivery is generally once, but exactly-once is not guaranteed, so handle duplicates. Failed deliveries are retried up to 5 times.

## Common Event Types

| Event (`type` field) | Triggered When | Common Use Cases |
|----------------------|----------------|------------------|
| `config.secrets.update` | Secrets are added, removed, or updated in a config | Redeploy or restart services, trigger pipelines, audit changes |

`config.secrets.update` is the only event type Doppler documents: the docs say `type` is "currently always `config.secrets.update`". The type is in the JSON body, not a header.

## Event Payload Structure

Default payload (used when the custom payload field is empty):

```json
{
  "type": "config.secrets.update",
  "config": {
    "name": "dev",
    "root": true,
    "locked": true,
    "initial_fetch_at": "2023-01-01T00:00:00.000Z",
    "last_fetch_at": "2023-01-01T00:00:00.000Z",
    "created_at": "2023-01-01T00:00:00.000Z",
    "environment": "dev",
    "project": "backend",
    "slug": "c9748dae-de1c-4971-b00c-f539970fee24"
  },
  "project": {
    "id": "backend",
    "slug": "backend",
    "name": "backend",
    "description": "",
    "created_at": "2023-01-01T00:00:00.000Z"
  },
  "workplace": { "id": "9f0c0c0d5d4e240ce26e", "name": "My Workplace" },
  "diff": { "added": ["FOO"], "removed": ["BAR"], "updated": ["BAZ"] }
}
```

`diff` lists secret **names** only, never values.

### Custom payloads

If you enter a custom JSON payload when creating the webhook, Doppler sends only that JSON. It has no variables or dynamic data and no `type` field, so a handler cannot route on it. Custom payloads are still signed when a Secret is set.

## Headers

| Header | Description |
|--------|-------------|
| `X-Doppler-Signature` | `sha256=<hex>` HMAC-SHA256 of the raw body. Present only when a Secret is set |

## Full Event Reference

See [Doppler's webhook documentation](https://docs.doppler.com/docs/webhooks).
