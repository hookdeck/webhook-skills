# Footprint Webhooks Overview

## What Are Footprint Webhooks?

Footprint (identity verification and KYC) sends a webhook when something happens to a user:
an onboarding completes, a reviewer changes a user's status, a watchlist check finishes. A
webhook is a `POST` with a JSON payload over HTTPS. Your endpoint returns an HTTP `2xx` to
confirm it processed the event. Delivery runs on [Svix](https://www.svix.com/), so the
request carries `svix-id`, `svix-timestamp`, and `svix-signature` headers. The event name is
in the body as `event_kind`.

## What Are the Common Event Types?

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `footprint.onboarding.completed` | A user's onboarding reaches a terminal status (`pass`, `fail`, `none`) | Approve or reject the user; fallback when the SDK returned `pending` |
| `footprint.onboarding.incomplete` | An onboarding started via `POST /onboardings` is still missing requirements | Prompt the user to finish |
| `footprint.onboarding.status_changed` | A user's status changed after onboarding or review. Deprecated | Legacy status sync |
| `footprint.watchlist_check.completed` | A watchlist check ran (continuous monitoring) | Flag users who appear on AML lists |
| `footprint.user.manual_review` | A dashboard user changed the user's status in manual review | Re-read the user with `GET /users/{fp_id}` |
| `footprint.user.info_requested` | A reviewer asked the user for more information | Notify the user |
| `footprint.user.bank_link_updated` | A user's bank link was updated | Track link state and errors |
| `footprint.vault.updated` | A user or business vault was updated | Sync changed fields |
| `footprint.entity.entity_status_set` | A custom status was set, updated, or cleared | Sync custom statuses |

Footprint's docs recommend subscribing to `footprint.onboarding.completed`, plus
`footprint.user.manual_review` for reviewer changes and `footprint.watchlist_check.completed`
if your playbook has continuous monitoring enabled. `status_changed` is marked deprecated in
the event catalog.

## What Does an Event Payload Look Like?

Common fields: `event_kind`, `fp_id` (the user), `is_live`, `timestamp` (ISO 8601).

```json
{
  "event_kind": "footprint.onboarding.completed",
  "external_id": null,
  "fp_id": "fp_id_xyz",
  "is_live": false,
  "onboarding_external_id": null,
  "onboarding_id": "ob_SRFT2a1mN7DAWJ0VPXkiqK",
  "playbook_key": "pb_test_QoEYTOve49Q2IAmaKVYnPs",
  "playbook_version": 3,
  "requires_manual_review": false,
  "status": "pass",
  "timestamp": "2024-06-14T02:40:00Z"
}
```

```json
{
  "event_kind": "footprint.watchlist_check.completed",
  "error": null,
  "external_id": null,
  "fp_id": "fp_id_xyz",
  "is_live": false,
  "onboarding_id": "ob_SRFT2a1mN7DAWJ0VPXkiqK",
  "status": "pending",
  "timestamp": "2024-06-14T02:40:00Z"
}
```

`footprint.onboarding.status_changed` carries `new_status` and `requires_manual_review`;
`footprint.user.manual_review` carries only the identifiers, so call `GET /users/{fp_id}` for
the new status. The examples above are the catalog's sample payloads.

## Which IPs Does Footprint Send From?

If your endpoint sits behind a firewall, Footprint lists these source addresses:
`44.228.126.217`, `50.112.21.217`, `52.24.126.164`, `54.148.139.208`, `2600:1f24:64:8000::/56`.

## Retries

Footprint's webhook page says only that the endpoint should return `2xx`. It doesn't
document a retry schedule; retries follow Svix's delivery behavior. `svix-id` is stable across
attempts, so deduplicate on it.

## Full Event Reference

For the complete list and payload schemas, see the
[Footprint event catalog on Svix](https://www.svix.com/event-types/us/org_2LbAthqjvv71cc7eYpwvHoeuuEw/)
and [Footprint's webhook documentation](https://docs.onefootprint.com/articles/integrate/webhooks).
