# Cloudsmith Webhooks Overview

## What Are Cloudsmith Webhooks?

Cloudsmith is a hosted package and artifact repository. Webhooks are configured per repository and send a `POST` to your URL when a package changes state. If a webhook has an HMAC signature key, each delivery carries `X-Cloudsmith-Signature`. The docs do not describe retries, timeouts or which response codes count as success, so make handlers fast and idempotent. SSL verification of your endpoint can be turned off per webhook.

## Common Event Types

The event is the body's `meta.event_id`. There is no event-name header.

| Event (`meta.event_id`) | Triggered When | Common Use Cases |
|-------------------------|----------------|------------------|
| `ping` | The test action on the webhook | Connectivity check |
| `package.created` | A package is uploaded | Audit trail, CI hand-off |
| `package.syncing` | A package starts syncing | Progress tracking |
| `package.synced` | A package is fully synchronised | Trigger deployments |
| `package.security_scanned` | A security scan finishes | Fetch results, gate releases |
| `package.quarantined` | A package is quarantined | Alert the owning team |
| `package.failed` | A package fails to sync | Failure alerts |
| `package.released` | A package is released | Promote downstream |
| `package.restored` | A package is restored | Re-sync mirrors |
| `package.tags_updated` | A package's tags change | Track `latest` moves |
| `package.deleted` | A package is deleted | Remove mirrored records |

## Event Payload Structure

```json
{
  "data": {
    "name": "my-file.deb",
    "namespace": "my-org",
    "repository": "my-repo",
    "format": "raw",
    "identifier_perm": "xKYgfsOsboz6",
    "stage_str": "Fully Synchronised",
    "status_str": "Completed",
    "cdn_url": "https://dl.cloudsmith.io/basic/my-org/my-repo/raw/files/my-file.deb",
    "tags": { "version": ["latest"] }
  },
  "meta": {
    "attempt_at": "2020-07-07T17:30:34.342167+00:00",
    "event_at": "2020-07-07T17:30:34.296482+00:00",
    "event_id": "package.synced",
    "trigger_id": "c0e2b63e-3d84-4d54-bd62-ae7d0b2764a7",
    "webhook_id": 1
  }
}
```

- `data`: the package (many more fields than shown: checksums, files, URLs, sync stage)
- `meta.event_id`: the event type
- `meta.trigger_id`: identifies the trigger, useful for deduplication
- `meta.webhook_id`: which webhook sent this

Each webhook picks a payload format: JSON object (default), JSON array (wraps the object in `[...]`), form-encoded JSON (`payload=<url-encoded JSON>`) or a Handlebars template. The signature covers whatever bytes are sent, and `meta.event_id` is only reliably at that path for the JSON object format.

## Full Event Reference

For the complete list and example payloads, see [Cloudsmith's webhook documentation](https://docs.cloudsmith.com/developer-tools/webhooks).
