# Juniper Mist Webhooks Overview

## What Mist Sends

Mist sends a `POST` with a JSON body to the webhook URL for each batch of events on a subscribed topic.

| Header | When |
|---|---|
| `X-Mist-Signature-v2` | Type `http-post` with a Secret: hex HMAC-SHA256 of the body |
| `X-Mist-Signature` | Same condition: hex HMAC-SHA1 of the body (legacy) |
| Custom headers | Any you configure under Advanced Settings (up to 1000 bytes in total) |
| `X-Mist-Error` | Sent instead when the custom headers are invalid, too big or not strings |

## Webhook Types

| Type | Signed? | Notes |
|---|---|---|
| HTTP Post (`http-post`) | Only with a Secret | The type this skill covers |
| OAuth2 | No | Mist gets a token from your authorization server and sends it in the `Authorization` header |
| Splunk | No | Sends to a Splunk HTTP Event Collector with a Splunk token |

**Verify Certificate** is on by default. Turning it off lets Mist post to a receiver with an invalid certificate, which Mist doesn't recommend.

## Payload

```json
{ "topic": "device-events", "events": [ { "...": "..." }, { "...": "..." } ] }
```

- `topic`: the subscribed topic this batch belongs to
- `events`: one or more event objects. Fields vary by topic. Most carry `org_id`, `site_id` and a `timestamp` (epoch seconds)

Common fields by topic (check real deliveries before you rely on them):

| Topic | Typical fields |
|---|---|
| `alarms` | `type`, `severity`, `group`, `count`, `site_id`, `last_seen` |
| `audits` | `admin_name`, `message`, `src_ip`, `id` |
| `device-events` | `type`, `device_type`, `device_name`, `mac`, `site_name` |
| `device-updowns` | `type`, `device_name`, `mac`, `site_name` |

## Topics

Topics differ between org-level and site-level webhooks, and the portal only lists the ones available at that level. They include `alarms`, `audits`, `device-events`, `device-updowns`, `client-join`, `client-sessions`, `client-info`, `nac-accounting`, `nac-events`, `location`, `zone`, `occupancy-alerts` and `ping`. The [Mist OpenAPI spec](https://github.com/mistsys/mist_openapi) has the full list and a schema for each topic.

## Delivery

The Mist pages used for this skill don't describe retries, timeouts or ordering. Respond `200` quickly and make handlers idempotent.
