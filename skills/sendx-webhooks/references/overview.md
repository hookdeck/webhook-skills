# SendX Webhooks Overview

## What Are SendX Webhooks?

SendX (sendx.io) is an email marketing platform. A team webhook notifies your endpoint with an HTTP
`POST` when contacts are created or unsubscribe, and when email engagement happens across campaigns,
drips, RSS campaigns, workflows and seed tests. Each delivery is signed with HMAC-SHA256 using your
team API key.

## Event Types

Every event body has a top-level `type` that is an **integer code**, not a string. Compare it as a number.

| Event | Campaign | Drip step | RSS | Workflow email | Seed contact |
|-------|----------|-----------|-----|----------------|--------------|
| MailOpen | `7` | `32` (DripStepMailOpen) | `172` (RssExecMailOpen) | `189` (WorkflowEmailMailOpen) | `271` (SeedContactMailOpen) |
| LinkClick | `8` | `33` (DripStepLinkClick) | `173` (RssExecLinkClick) | `190` (WorkflowEmailLinkClick) | `272` (SeedContactLinkClick) |
| MailBounced | `5` | `63` (DripStepMailBounced) | `180` (RssExecMailBounced) | `197` (WorkflowEmailMailBounced) | `276` (SeedContactMailBounced) |
| MailSpam | `6` | `62` (DripStepMailSpam) | `179` (RssExecMailSpam) | `196` (WorkflowEmailMailSpam) | `275` (SeedContactMailSpam) |
| MailDropped | `60` | `61` (DripStepMailDropped) | `178` (RssExecMailDropped) | `195` (WorkflowEmailMailDropped) | `278` (SeedContactMailDropped) |

| Event | `type` |
|-------|--------|
| ContactCreated | `74` |
| GlobalUnsubscribe | `73` |

The webhook's subscription toggles are `contactCreated`, `unsubscribed`, `dropped`, `bounced`,
`markedSpam`, `clicked` and `opened`.

## Request Headers

| Header | Meaning |
|--------|---------|
| `X-SendX-Signature` | Bare lowercase hex HMAC-SHA256 of the raw body |
| `X-SendX-Signature-Alg` | `hmac-sha256` (logging only) |
| `X-SendX-Webhook-Id` | Delivery id (use for idempotency) |
| `X-SendX-Webhook-Attempt` | Attempt number (`1` on the first try) |

## Payload Structure

The body is flat JSON with a top-level integer `type`. The Webhook Object page also lists `time`
(documented as milliseconds since the epoch, though its example `1686304219037565000` is
nanosecond-scale), `data` (a string) and nullable IDs: `provider_message_id`, `campaign_id`,
`drip_step_id`, `rss_exec_id`, `tag_id`, `link`, `list_id`, `contact_id`, `contact_email`,
`custom_field_id`, `template_id`, `popup_id`, `landing_page_id`, `form_id`, `segment_id`,
`automation_id`, `drip_id`, `rss_id`, `ab_test_id`, `workflow_id`, `workflow_node_id` and
`workflow_email_id`. Treat every field as untrusted and check its type before reading it.

## Delivery

Respond with a `200` in under 5 seconds (advice from the docs, not a stated timeout). Retries exist
(see the attempt header) but the schedule is not documented.

## Full Event Reference

See [SendX Webhook Object](https://docs.sendx.io/api-reference/webhook/sendx-webhook-object) and
[Verifying SendX Webhook](https://docs.sendx.io/api-reference/webhook/verify-webhook).
