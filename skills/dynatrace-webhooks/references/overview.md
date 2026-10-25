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

`OPEN` is the only value the docs show (in the test notification's example payload). Dynatrace
also notifies when a problem is resolved, but the docs don't print the `{State}` value for that
case, so check a real delivery before matching on it; the examples log any non-`OPEN` state.

## Payload Structure (Illustrative)

The payload is whatever your template produces. The documented placeholders are
`{ImpactedEntities}`, `{ImpactedEntity}`, `{PID}`, `{ProblemDetailsHTML}`, `{ProblemDetailsJSON}`,
`{ProblemID}`, `{ProblemImpact}`, `{ProblemTitle}`, `{State}` and `{Tags}` (`{ImpactedEntities}`
and `{ProblemDetailsJSON}` are JSON values and take no quotes). No problem-URL placeholder is
documented; the docs' example uses a literal `"Problem URL": "https://example.com"`. The examples in
this skill assume this JSON template (it is **not** a vendor schema):

```json
{
  "ProblemID": "P-2401",
  "State": "OPEN",
  "ProblemTitle": "Response time degradation",
  "ImpactedEntity": "checkout-service"
}
```

If your template emits text or XML, the examples acknowledge it with `200` but only dispatch JSON
objects; adapt the handler to your format.

## Full Reference

See [Dynatrace's webhook integration documentation](https://docs.dynatrace.com/docs/analyze-explore-automate/alerting-and-notifications-classic/problem-notifications/webhook-integration)
for the placeholders and the example template.
