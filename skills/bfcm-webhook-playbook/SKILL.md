---
name: bfcm-webhook-playbook
description: >
  Black Friday / Cyber Monday (BFCM) webhook playbook: prepare webhook
  handling for peak commerce traffic, and recover when webhooks are failing
  mid-incident. Use when preparing Shopify, Stripe, BigCommerce, WooCommerce
  or PayPal webhooks for BFCM or another traffic peak, when webhook delivery
  is failing or an endpoint is down ("our webhooks are failing, what do we
  do?"), or when replaying missed webhooks in order after an outage. Uses the
  Hookdeck Event Gateway via CLI, REST API and Terraform.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# BFCM Webhook Playbook: Prepare and Recover

Black Friday / Cyber Monday is when webhook volume peaks and when an outage costs the most: missed `orders/create` or `payment_intent.succeeded` webhooks mean unfulfilled orders and lost revenue. This skill covers both halves:

- **Prepare**: put Event Gateway in front of your endpoints (inline) before the peak, so it queues and retries webhooks if your infrastructure fails. If you can't change where the provider sends, a standby source beside your endpoint records a copy instead.
- **Recover**: when webhooks are failing *right now*, stop the loss, fix the endpoint, then replay everything you missed, oldest first, at a rate your system can take.

Every step is a **CLI command, REST API call or Terraform resource** — there are no dashboard instructions — so an agent can run the runbook end to end.

## When to Use This Skill

- "Our webhooks are failing / our endpoint is down — what do we do?"
- "We missed webhooks during an outage. How do we get them back?"
- "Our webhooks are failing and we have no Event Gateway. Can we move onto it now?"
- "How do we prepare our Shopify/Stripe webhooks for Black Friday?"
- "How do we replay missed webhooks without overwhelming our API?"
- "How do we replay missed webhooks in the right order?"

## Start Here: Triage

Ask (or work out) two things before running anything.

**1. Are you preparing, or is something failing right now?**

| Situation | Go to |
|-----------|-------|
| Preparing ahead of the peak | [references/prepare.md](references/prepare.md) (recommended: inline, with Event Gateway in front of the endpoint), with [references/terraform.md](references/terraform.md) for infrastructure-as-code |
| Failing right now | Question 2 |

**2. How does Event Gateway sit in your webhook path today?**

| Setup | What it looks like | Runbook |
|-------|--------------------|---------|
| **Standby** | The provider sends to your endpoint directly **and** to an Event Gateway source that has **no connection**. Event Gateway verifies and records every request but delivers nothing. | [references/incident-standby.md](references/incident-standby.md) |
| **Inline** | The provider sends only to Event Gateway; a connection delivers to your endpoint. | [references/incident-inline.md](references/incident-inline.md) |
| **None** | The provider sends straight to your endpoint. | **Move inline now** if you can change where the provider sends: [references/incident-move-inline.md](references/incident-move-inline.md), then the inline runbook. If you can't, [emergency standby capture](references/incident-standby.md#no-event-gateway-yet-emergency-capture): create a standby source **now** to stop further loss, then follow the standby runbook |

## Rules for Agents Running a Runbook

These are not optional. Recovery commands change production delivery.

1. **Confirm the project first.** Run `hookdeck whoami`, show the output, and get the user to confirm the organization and project before any command that changes state.
2. **Dry-run every bulk operation.** Call the bulk operation's `/plan` endpoint, show the `estimated_count`, and get explicit human confirmation before creating it.
3. **Record every ID and timestamp** you use (`T0`, `T1`, source/connection/destination IDs, bulk operation IDs) in the incident notes as you go.
4. **Never run a bulk replay twice over the same window.** Replay creates new requests and events every time it runs; a second run delivers everything again.
5. **Filter replays on `rejection_cause=NO_CONNECTION` and `created_at[gte]`/`[lte]` only.** `status=rejected` overrides the cause filter and matches forged (`VERIFICATION_FAILED`) requests too. `created_at[gt]`/`[lt]` are ignored (for requests and events), which silently removes the bound. Sanity-check every dry-run count against the expected outage volume.
6. **Choose the replay mode with the user.** Ordered replay keeps exact capture order at about 4–5 requests a second; bulk replay is fast but shuffles order within each batch of 100. See [references/ordering.md](references/ordering.md).
7. **Prefer lowering the delivery rate over pausing.** See [references/ordering.md](references/ordering.md) for why unpausing a large backlog disturbs order.
8. **Install the Hookdeck CLI first** (`npm i -g hookdeck-cli` or `brew install hookdeck/hookdeck/hookdeck`) and authenticate non-interactively with `hookdeck ci --api-key "$HOOKDECK_API_KEY"`. It prints the project and organization it configured.

## Key Facts the Runbooks Rely On

- **A source with no connection still records requests.** For a genuine webhook, the ingestion edge returns `200` (`{"status":"SUCCESS"}`), so the provider counts the delivery as successful and won't retry or disable the subscription. The request is stored as rejected with cause `NO_CONNECTION`. This is what makes the standby setup work.
- **Every source in these runbooks verifies its input.** The standby source verifies the provider signature: forged requests get `401` and are stored as `VERIFICATION_FAILED`, so recovery never replays them. The recovery source requires an API key nobody sends, because its connection delivers straight to production. Replay skips source verification, so neither blocks a replay.
- **Retry vs replay.** *Retry* re-delivers an existing event (or re-processes a rejected request on its own source). *Replay* re-ingests a stored request as a brand-new request, and can target **another source's connections**. Bulk replay is how recovery delivers captured requests to a recovery connection.
- **Two ways to replay a backlog.** *Ordered replay* replays requests one at a time, oldest first, and delivers in exact capture (`created_at`) order at about 4–5 requests a second. *Bulk replay* is one API call that takes requests oldest first in batches of 100. Order is kept between batches but effectively random within each one. Bulk replay only includes requests created before the operation started, and a second operation over the same window delivers everything again.
- **Order is never guaranteed**, by Event Gateway or by the providers (Shopify and Stripe both document this). Recovery can get close, or exact with ordered replay, but handlers must still tolerate out-of-order and duplicate events. See [references/ordering.md](references/ordering.md).
- **Payload retention is finite.** Replaying a request whose payload is outside your plan's retention window fails with `409 DATA_ARCHIVED`. Check retention before relying on a standby source.

## Resources

- [references/prepare.md](references/prepare.md) — Pre-peak checklist: handler readiness, inline setup (recommended) or standby fallback, delivery rate, alerting, rehearsal (CLI and API)
- [references/terraform.md](references/terraform.md) — Standby source, pre-provisioned recovery lane, provider registration and alerting as Terraform
- [references/incident-standby.md](references/incident-standby.md) — Recovery runbook when Event Gateway is capturing on a connection-less source; also the emergency capture path when you have no Event Gateway and can't change where the provider sends
- [references/incident-inline.md](references/incident-inline.md) — Recovery runbook when Event Gateway already delivers to your endpoint
- [references/incident-move-inline.md](references/incident-move-inline.md) — Migration path when webhooks are failing and you have no Event Gateway yet: create a held connection, point the provider at it, then continue the inline runbook
- [references/ordering.md](references/ordering.md) — Measured ordering for ordered replay, bulk replay, unpause and bulk retry, and how to choose
- [references/provider-notes.md](references/provider-notes.md) — Shopify, Stripe, BigCommerce, WooCommerce and PayPal timeouts, retry windows, auto-disable rules and resend options

## Related Skills

- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) — Idempotency, error handling, retry logic and out-of-order handling in the handler itself
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) — Event Gateway setup and concepts
- [hookdeck-event-gateway-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway-webhooks) — Verify the `x-hookdeck-signature` on deliveries from Event Gateway
- [shopify-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/shopify-webhooks) — Shopify webhook verification and topics
- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) — Stripe webhook verification and events
- [bigcommerce-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/bigcommerce-webhooks) — BigCommerce webhook handling
- [woocommerce-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/woocommerce-webhooks) — WooCommerce webhook handling
- [paypal-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/paypal-webhooks) — PayPal webhook verification
