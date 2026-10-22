# Checkly Webhooks Overview

## What Are Checkly Webhooks?

Checkly is a synthetic monitoring platform. Its webhook alert channel sends an HTTP POST to any endpoint whenever a check changes state (fails, recovers, degrades). You define the URL and the request body as a Handlebars template, so the payload shape is yours, not fixed by Checkly. Webhooks can be attached to individual checks or groups, and group-level variables are available in the template.

## Common Event Types

The alert type is available in the template as `{{ALERT_TYPE}}`. The examples in this skill put it in an `alertType` field.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `ALERT_FAILURE` | A check fails | Open an incident, page on-call |
| `ALERT_RECOVERY` | A failing check passes again | Resolve the incident |
| `ALERT_DEGRADED` | A check is degraded (slow, but not failing) | Warn, open a low-priority ticket |
| `ALERT_DEGRADED_RECOVERY` | A degraded check recovers | Clear the warning |
| `ALERT_DEGRADED_FAILURE` | Degraded check escalates to failing | Escalate the incident |
| `ALERT_FAILURE_DEGRADED` | Failing check de-escalates to degraded | Downgrade severity |
| `ALERT_FAILURE_REMAIN`, `ALERT_DEGRADED_REMAIN` | Still failing or degraded after a threshold | Reminders |
| `ALERT_SSL` | SSL certificate nearing expiry | Renew certificate |

## Event Payload Structure

Example template (the fields the skill's handlers read are `alertType`, `checkName`, `checkId`):

```json
{
  "alertType": "{{ALERT_TYPE}}",
  "checkName": "{{CHECK_NAME}}",
  "checkId": "{{CHECK_ID}}",
  "alertTitle": "{{ALERT_TITLE}}",
  "resultLink": "{{RESULT_LINK}}"
}
```

Other variables include `CHECK_TYPE`, `CHECK_ERROR_MESSAGE`, `RUN_LOCATION`, `REGION`, `RESPONSE_TIME`, `STARTED_AT`, `TAGS`, `IS_REMINDER`, `REMINDER_SEQUENCE`, `SSL_CHECK_DOMAIN` and `SSL_DAYS_REMAINING`.

## Delivery

- Method: `POST`, body exactly as rendered from your template.
- Headers: `x-checkly-signature` (when a secret is set) and `x-checkly-timestamp`.
- Retries: up to 5 times, 20 seconds apart, when your endpoint returns a status above 399.
- For checks on a 1-minute schedule a failure and its recovery can overlap, so deliveries may arrive out of order.

## Full Event Reference

See [Checkly webhook documentation](https://www.checklyhq.com/docs/integrations/alerts/webhooks/) and [alert states](https://www.checklyhq.com/docs/communicate/alerts/overview#alert-states).
