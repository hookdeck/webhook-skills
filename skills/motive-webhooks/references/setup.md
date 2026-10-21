# Setting Up Motive Webhooks

## Prerequisites

- A Motive fleet account with API access
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 motive --path /webhooks/motive` while developing)

## Get Your Signing Secret

Every webhook has a **secret**. You choose it when creating the webhook: it must be **20 characters**, and Motive generates one if you leave it blank. Fetch the webhook afterwards (see "Fetch a webhook using its ID" in the API reference) to read a generated secret. Store it as `MOTIVE_WEBHOOK_SECRET`.

## Register Your Endpoint

Webhooks are managed through the Motive API ("Create a new company webhook", `POST`). Per the API reference, the body takes:

| Field | Description |
|-------|-------------|
| `url` | The URL Motive sends data to |
| `secret` | Shared secret, 20 characters; generated if blank |
| `format` | Payload format; only `json` is supported |
| `actions` | Array of action names, e.g. `["vehicle_location_updated", "fault_code_opened", "fault_code_closed"]` |
| `enabled` | Whether the webhook is enabled |

The same API lists, fetches, and updates webhooks, lists past webhook requests, and can trigger a specific webhook. See [Create a new company webhook](https://developer.gomotive.com/reference/create-a-new-company-webhook).

Limits: one active webhook per action and URL, and at most two active webhooks per action.

## The Activation Test Request

When you enable a webhook, change its URL, or change its shared secret, Motive sends a **test request** and only enables the webhook if your endpoint answers **200 or 201**. The test payload is always `[vehicle_location_updated]`, which is **not valid JSON** (the action name is unquoted). So:

- Verify the signature first, then answer 200 without requiring the body to parse as JSON.
- Do not return 400 for unparseable bodies on this path. The examples in this skill return 200 with `ignored: true` for bodies that don't parse.
- Motive's docs don't say whether the test request carries `X-KT-Webhook-Signature`. If activation fails with a 403 from your endpoint, check the request in your logs and confirm the secret matches.

Your endpoint must also respond within 3 seconds.

## Webhooks v2 (SQS / SNS)

If your company has Webhooks v2 enabled you can point the URL at an AWS SQS queue or SNS topic and set `webhook_type`. Allow the role `arn:aws:iam::933794580186:role/wds--prod--use1--push-sender-role` to `sqs:SendMessage` or `sns:Publish` on the resource. That path has no HTTP endpoint of yours to verify.

## Test Mode vs Live Mode

Motive does not document a separate test mode. Use the API's "Trigger a specific webhook" call, or the activation test request, to exercise your endpoint.
