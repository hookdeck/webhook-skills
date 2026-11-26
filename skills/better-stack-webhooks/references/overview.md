# Better Stack Webhooks Overview

## What Are Better Stack Webhooks?

Better Stack's Uptime and incident management product sends **outgoing webhooks** to a URL you
choose when something changes. You add them under **Incidents -> Integrations -> Exporting data ->
Outgoing webhooks**, or with `POST /api/v2/outgoing-webhooks`. There are three kinds, picked by
`trigger_type`: an incident webhook (`incident_change`), a monitor webhook (`monitor_change`) and
an on-call change webhook (`on_call_change`).

Webhooks are **not signed**. The only protection Better Stack offers is a static credential, either
Basic auth or a custom header, which your endpoint checks. Better Stack's Errors product has its
own outgoing webhooks with a different body; they are out of scope here.

## When Each Kind Fires

| Kind | Fires when |
|------|------------|
| Incident webhook | An incident is created, acknowledged, resolved, reopened or commented on. The API toggles are `on_incident_started`, `on_incident_acknowledged`, `on_incident_resolved`, `on_incident_reopened` and `on_incident_comment`, each defaulting to `true` |
| Monitor webhook | A monitor is created, updated, paused, unpaused or deleted |
| On-call change webhook | An on-call contact changes, or someone's holiday starts or ends during their shift |

## Event Names (What Is and Isn't Documented)

There is no documented list of event names. The only documented wire value of an `event` field is
the top-level `"event": "comment"` on an incident webhook when someone comments. Whether the other
incident deliveries carry `event`, and with what values, is not documented, and monitor webhooks
document no `event` field. Don't invent names such as `incident.started`.

| Shape | How to recognise it | Notes |
|-------|---------------------|-------|
| Incident comment | `event` is `comment`, `data.type` is `incident` | Also has a top-level `comment` object |
| Incident started / acknowledged / resolved | `data.type` is `incident`, no `comment` event | State is an **inference**: `resolved_at` set means resolved, `acknowledged_at` set means acknowledged, otherwise started/open. A reopened incident looks like a started one |
| Monitor change | `data.type` is `monitor` | `paused_at` set means paused; created, updated, unpaused and deleted look alike |
| On-call change | `data.change` is `on_call` | "`on_call` otherwise" |
| Holiday change | `data.change` is `holiday` | "Only a holiday started or ended" |

A customised `body_template` may carry none of these fields, so log and acknowledge anything you
don't recognise.

## Default Payloads

Incident (`incident_change`), Better Stack's default template. Each `$VARIABLE` is replaced when the
webhook fires:

```json
{
  "data": {
    "id": "$INCIDENT_ID",
    "type": "incident",
    "attributes": {
      "name": "$NAME",
      "url": "$URL",
      "http_method": "$HTTP_METHOD",
      "cause": "$CAUSE",
      "started_at": "$STARTED_AT",
      "acknowledged_at": "$ACKNOWLEDGED_AT",
      "resolved_at": "$RESOLVED_AT",
      "response_content": "$RESPONSE_CONTENT",
      "response_url": "$RESPONSE_URL",
      "screenshot_url": "$SCREENSHOT_URL"
    }
  }
}
```

Better Stack's comment example shows unset timestamps as `null`. The default template quotes them,
and the docs don't show how an unset one renders there, so treat both `null` and an empty string as
unset. The comment example, and Better Stack's note about fetching monitor details from
`relationships.monitor`, show a `relationships.monitor` field next to `attributes`; the default
template listed in the API reference doesn't include it, so don't rely on it.

Incident comment (`event` is `comment`), abbreviated from the example in Better Stack's API reference:

```json
{
  "event": "comment",
  "data": { "id": "1", "type": "incident", "attributes": { "name": "Tesla.com homepage", "cause": "Error 500", "resolved_at": null } },
  "comment": {
    "id": "42",
    "type": "incident_comment",
    "attributes": {
      "content": "Investigating — the database has been failing over.",
      "created_at": "2020-10-21T10:55:12.812Z",
      "updated_at": "2020-10-21T10:55:12.812Z",
      "user_id": 7,
      "user_email": "jane@example.com"
    }
  }
}
```

Monitor (`monitor_change`): `data.id`, `data.type: "monitor"` and `data.attributes` with `url`,
`pronounceable_name`, `monitor_type`, `required_keyword`, `verify_ssl`, `check_frequency`, `call`,
`sms`, `email`, `team_wait`, `http_method`, `request_timeout`, `recovery_period`, `request_body`,
`paused_at` and `last_checked_at`.

On-call (`on_call_change`), Better Stack's default template. The `_JSON_ARRAY` variables, the
calendar ID and `$DEFAULT_ON_CALL_CALENDAR` sit outside quotes in the template:

```json
{
  "data":{
    "message": "$MESSAGE",
    "emails": $EMAILS_JSON_ARRAY,
    "on_holiday_emails": $ON_HOLIDAY_EMAILS_JSON_ARRAY,
    "change": "$CHANGE",
    "calendar_id": $ON_CALL_CALENDAR_ID,
    "calendar_name": "$ON_CALL_CALENDAR_NAME",
    "primary_calendar": $DEFAULT_ON_CALL_CALENDAR
  }
}
```

`emails` lists everyone on shift. Those on holiday are also in `on_holiday_emails`, and Better
Stack doesn't alert them until their holiday ends.

## Delivery

The default method is `POST`, but the webhook can use `get`, `post`, `put`, `patch`, `head` or
`options`. The Uptime pages document no timeout, retry policy or IP list. Respond quickly with a 2xx.

## Full Reference

- [Outgoing webhooks](https://betterstack.com/docs/uptime/webhooks/)
- [Create outgoing webhook (API)](https://betterstack.com/docs/uptime/api/create-outgoing-webhook-integration/)
- [Update outgoing webhook (API)](https://betterstack.com/docs/uptime/api/update-outgoing-webhook-integration/)
