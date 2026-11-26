# Setting Up Motive Webhooks

## Prerequisites

- A Motive fleet account with API access, or a partner app in Motive's developer portal
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 motive --path /webhooks/motive` while developing)

## Get Your Signing Secret

Every webhook has a **secret**. You choose it when creating the webhook: it must be **20 characters**, and Motive generates one if you leave it blank. Fetch the webhook afterwards (see "Fetch a webhook using its ID" in the API reference) to read a generated secret. Store it as `MOTIVE_WEBHOOK_SECRET`.

## Register Your Endpoint

Webhooks are managed through the Motive API ("Create a new company webhook", `POST /v1/company_webhooks`). Per the API reference, these are passed as query parameters:

| Field | Description |
|-------|-------------|
| `url` | The URL Motive sends data to |
| `secret` | Shared secret, 20 characters; generated if blank |
| `format` | Payload format; only `json` is supported |
| `actions` | Array of action names, e.g. `["vehicle_location_updated", "fault_code_opened", "fault_code_closed"]` |
| `enabled` | Whether the webhook is enabled |

The same API lists, fetches, and updates webhooks, lists past webhook requests, and can trigger a specific webhook. See [Create a new company webhook](https://developer-docs.gomotive.com/reference/create-a-new-company-webhook).

Limits: one active webhook per action and URL, and at most two active webhooks per action.

Partner (OAuth) apps can also add webhooks in Motive's developer portal. Its URL field only accepts hosts whose top-level domain is 2 to 5 letters, so it rejects `https://hkdk.events/...`. For a Hookdeck source, enter `https://events.hookdeck.com/e/` followed by the part of the source URL after `hkdk.events/` instead (the same source, under a URL the portal accepts).

## The Activation Test Request

When you enable a webhook, change its URL, or change its shared secret, Motive sends a **test request** and only enables the webhook if your endpoint answers **200 or 201**.

Motive's docs print the test payload as `[vehicle_location_updated]`, which looks like invalid JSON, but a live test (2026-11-18) showed a normal, signed request:

```http
POST /webhooks/motive HTTP/1.1
Content-Type: application/json
User-Agent: Ruby
X-KT-Webhook-Signature: <hex HMAC-SHA1 of the body>

["vehicle_location_updated","fault_code_closed"]
```

The body is a JSON **array of the webhook's actions**, not an event object. So:

- Verify the signature first, then answer 200 to an array body without processing it. The examples in this skill do that.
- Don't treat a JSON parse error as the test request. The examples still answer 200 to a signed body that doesn't parse, without processing it.

Your endpoint must also respond within 3 seconds.

## Webhooks v2 (SQS / SNS)

If your company has Webhooks v2 enabled you can point the URL at an AWS SQS queue or SNS topic and set `webhook_type`. Allow the role `arn:aws:iam::933794580186:role/wds--prod--use1--push-sender-role` to `sqs:SendMessage` or `sns:Publish` on the resource. That path has no HTTP endpoint of yours to verify.

## Test Mode vs Live Mode

Motive does not document a separate test mode. Use the API's "Trigger a specific webhook" call, or the activation test request, to exercise your endpoint.
