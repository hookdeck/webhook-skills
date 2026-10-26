# Dots Webhooks Overview

## What Are Dots Webhooks?

Dots (usedots.com), a payouts API for payout links, flows, transfers, and user onboarding,
sends a webhook when one of your resources changes. A webhook is a `POST` with a JSON payload
over HTTPS. Your endpoint returns an HTTP `2xx` within 15 seconds to confirm it processed the
event. Delivery runs on [Svix](https://www.svix.com/), so the request carries `svix-id`,
`svix-timestamp`, and `svix-signature` headers.

Payloads are flat and ID-based: the top-level `event` field names the event, beside the id of
the resource that changed. Dots recommends subscribing to the canonical `.updated` events and
fetching the resource by that id to read its current state.

## What Are the Common Event Types?

Dots documents these 12 events (the list may not be exhaustive):

| Event | Triggered When | Id fields | Common Use Cases |
|-------|----------------|-----------|------------------|
| `payment_intent.updated` | A payment intent was updated | `payment_intent_id` | Re-fetch the intent, reconcile funding |
| `payment_method.updated` | A payment method was updated | `payment_method_id` | Refresh stored payment method state |
| `flow.updated` | A flow was updated | `flow_id` | Track a user's progress through a flow |
| `dispute.updated` | A dispute was updated | `dispute_id` | Alert on new or resolved disputes |
| `payout_request.updated` | A payout request changed status | `payout_request_id` | Update payout status in your system |
| `organization.updated` | An organization was updated | `organization_id` | Sync organization settings |
| `app.updated` | An app was updated | `app_id` | Sync app settings |
| `transfer.updated` | A transfer was updated | `transfer_id` | Track settlement and failures |
| `payout_link.updated` | A payout link was updated | `payout_link_id` | Know when a recipient claims a payout |
| `user.updated` | A user was updated | `user_id` | Re-fetch the user record |
| `user.onboarded` | A verification debit settled, verifying a bank account | `user_id`, `ach_account_id`, `flow_id`, `transfer_id` | Mark the user as onboarded |
| `user.onboarding_revoked` | A verification debit failed or was returned, leaving a bank account unverified | `user_id`, `ach_account_id`, `flow_id`, `transfer_id`, `reason` | Notify the user to retry from the flow |

`user.onboarded` is sent once for each bank account the user verifies; the user is onboarded
once any bank account is verified. `user.onboarding_revoked` can arrive without a prior
`user.onboarded` (for example when the first debit fails), and other verified bank accounts
stay verified.

## What Does an Event Payload Look Like?

```json
{
  "event": "transfer.updated",
  "transfer_id": "transfer-id"
}
```

```json
{
  "ach_account_id": "ach-account-id",
  "event": "user.onboarding_revoked",
  "flow_id": "flow-id",
  "reason": "Insufficient funds",
  "transfer_id": "transfer-id",
  "user_id": "user-id"
}
```

Webhooks that originate from an app and are delivered to an organization-level endpoint also
include `api_app_id`, the originating app. These are the sample payloads from Dots' event
catalog.

## Retries

Dots' webhook page doesn't document a retry schedule or an endpoint-disabling policy; delivery
and retries follow Svix's behavior. `svix-id` is stable across attempts, so deduplicate on it.

## Full Event Reference

For the complete event catalog, see [Dots' webhook documentation](https://docs.usedots.com/references/webhooks).
