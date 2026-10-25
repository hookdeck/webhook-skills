# Dynatrace Webhooks Overview

## What Are Dynatrace Webhooks?

In Dynatrace (Classic) problem notifications, the **Custom integration** (webhook) type POSTs to a
URL you choose when a problem is opened or resolved. Requests are not signed. You write the
payload yourself as a template with placeholders; Content-Type can be JSON, text or XML. There is
no vendor event field, so the template must include `{State}` if you want to tell problem
openings from resolutions.

## Problem States

| `State` | Triggered When | Common Use Cases |
|---------|----------------|------------------|
| `OPEN` | A problem is opened | Page on-call, open a ticket |
| `RESOLVED` | The problem is resolved | Close the ticket |

## Payload Structure (Illustrative)

The payload is whatever your template produces. Common placeholders include `{ProblemID}`,
`{State}`, `{ProblemTitle}`, `{ImpactedEntity}` and `{ProblemURL}`. The examples in this skill
assume this JSON template (it is **not** a vendor schema):

```json
{
  "ProblemID": "P-2401",
  "State": "OPEN",
  "ProblemTitle": "Response time degradation",
  "ImpactedEntity": "checkout-service",
  "ProblemURL": "https://example.live.dynatrace.com/#problems/problemdetails;pid=1234"
}
```

If your template emits text or XML, the examples acknowledge it with `200` but only dispatch JSON
objects; adapt the handler to your format.

## Full Reference

See [Dynatrace's webhook integration documentation](https://docs.dynatrace.com/docs/analyze-explore-automate/alerting-and-notifications-classic/problem-notifications/webhook-integration)
for the full list of placeholders.
