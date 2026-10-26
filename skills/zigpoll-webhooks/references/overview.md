# Zigpoll Webhooks Overview

## What Are Zigpoll Webhooks?

Zigpoll runs on-site surveys. A webhook sends an HTTP POST with a JSON body to your public HTTPS URL when a respondent submits answers, so you can push survey responses into your own systems. Each webhook subscribes to one survey. You can add up to 20 per survey, and also trigger a webhook conditionally with the **Trigger webhook** action in question or survey logic (same payload, signature, retries and delivery id).

## Common Event Types

The payload `type` field names the event. Each webhook has a delivery rule that picks which one it sends.

| Event (`type`) | Triggered When | Common Use Cases |
|----------------|----------------|------------------|
| `submitted-responses` | Rule "Send if the survey is partially or fully completed": on every submission, even if the respondent stops partway | Capture partial answers, live dashboards |
| `completed-survey` | Rule "Send only if the survey is fully completed": once the respondent reaches the end | CRM sync, follow-up emails |

Responses are briefly batched before sending, so a respondent answering several questions in a row produces one delivery containing all their answers.

## Event Payload Structure

```json
{
  "type": "submitted-responses",
  "accountId": "",
  "pollId": "",
  "participantId": "",
  "metadata": {},
  "responses": {},
  "submissionsComplete": false,
  "timestamp": 1754400000000,
  "email": "jane@example.com",
  "emails": ["jane@example.com"]
}
```

- `type`: `submitted-responses` or `completed-survey`
- `submissionsComplete`: did the respondent finish the survey?
- `timestamp`: milliseconds since the epoch
- `email` / `emails`: first email found, and every email found, from the answers, participant metadata and response metadata. Surveys in anonymous mode always send `null` and `[]`.

## Headers

`Content-Type: application/json`, `X-Zigpoll-Signature`, `X-Zigpoll-Delivery-Id` (same across retries), `X-Zigpoll-Attempt` (starts at `1`), `X-Zigpoll-Triggered-At`.

## Retries and Delivery

Reply `2xx` within 10 seconds. Timeouts, refused connections, `5xx`, `429` and `408` are retried up to five more times (1 minute, 5 minutes, 30 minutes, 2 hours, 6 hours). Any other `4xx` is a permanent rejection and is not retried, so a bad signature response is not redelivered. Delivery is at-least-once: dedupe on `X-Zigpoll-Delivery-Id`.

## Full Event Reference

See [Zigpoll's webhook documentation](https://docs.zigpoll.com/integrations/webhooks).
