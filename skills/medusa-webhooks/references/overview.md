# Medusa Webhooks Overview

## What Are Medusa Webhooks?

Medusa Cloud sends HTTPS `POST` requests to an endpoint you register for your organization when builds and deployments change state, so you can react without polling. Webhook events are available on the Launch, Scale, and Enterprise plans.

- Only **one endpoint per organization**. It receives events for every project and environment in the organization.
- If the organization has no endpoint, or the endpoint is disabled, nothing is sent.
- Your endpoint must return a `2xx` within **ten seconds**. Redirects (`3xx`), other status codes, timeouts, and unreachable endpoints all count as failures.
- Failed deliveries are retried with exponential backoff starting at five minutes (doubling each attempt) for up to 24 hours, then marked failed.

These are Cloud-only. Self-hosted Medusa has no built-in outbound webhooks, and application events such as `order.placed`, `order.updated`, `customer.created`, or `product.created` are internal Medusa events consumed by subscribers; they are not delivered to this endpoint.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `build.created` | Medusa creates a build for an environment (after a push to its branch) | Track build starts |
| `build.succeeded` | A build completes successfully | Notify chat, trigger smoke tests |
| `build.failed` | A build fails | Alert the team |
| `build.canceled` | A build is canceled | Update status boards |
| `deployment.created` | Medusa creates a deployment for an environment | Mark a release as in progress |
| `deployment.succeeded` | A deployment completes successfully | Announce release, post-deploy checks |
| `deployment.failed` | A deployment fails | Page on-call |
| `deployment.canceled` | A deployment is canceled | Update status boards |

## Event Payload Structure

Every event shares one envelope (a JSON object, not an array):

```json
{
  "id": "whev_01HXYZ6789ABCDEF",
  "type": "deployment.succeeded",
  "created_at": "2024-11-12T10:10:00.000Z",
  "data": {
    "deployment": { "id": "depl_01HXYZ6789ABCDEF", "status": "succeeded" },
    "build": { "id": "build_01HXYZ5678ABCDEF", "commit_hash": "a1b2c3d4e5f6", "commit_message": "Add new product feature", "commit_author": "Jane Doe" },
    "organization": { "id": "org_01HXYZ9012ABCDEF", "name": "Acme Corp" },
    "project": { "id": "proj_01HXYZ3456ABCDEF", "name": "My Storefront", "handle": "my-storefront", "repository": "https://github.com/acme/storefront", "region": "eu-west-1" },
    "environment": { "id": "projenv_01HXYZ7890ABCDEF", "name": "Production", "handle": "production", "branch": "main" }
  }
}
```

- `id` is reused across retries of the same event: use it (or `X-Medusa-Delivery`) as the idempotency key.
- `created_at` is when Medusa queued the event, not when the resource changed.
- `build.*` events carry `data.build` (with `status`); `deployment.*` events carry `data.deployment` and the associated `data.build`.

Request headers: `X-Medusa-Event` (same as `type`), `X-Medusa-Delivery` (same as `id`), `X-Medusa-Signature`, and `User-Agent: MedusaCloud-Webhook/1.0`.

## Full Event Reference

See [Medusa Cloud's webhooks reference](https://docs.medusajs.com/cloud/webhooks/reference).
