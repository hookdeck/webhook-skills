# PingOne Webhooks Overview

## What Are PingOne Webhooks?

PingOne (Ping Identity) calls them **subscriptions**. A subscription in an environment matches
audit events (`filterOptions.includedActionTypes`) and delivers them over HTTPS to a URL you
choose. Requests are not signed. Authentication is a header you add to the subscription
(`httpEndpoint.headers`, for example `"Authorization": "Basic username:password"`); PingOne sends
it exactly as typed on every delivery.

If your endpoint is down, PingOne keeps retrying the current event until it gets a `200`, and
starts losing events after about 7 days.

## Common Event Types

Every event carries `action.type`. Examples from the Audit Reporting Events reference:

| `action.type` | Triggered When | Common Use Cases |
|---------------|----------------|------------------|
| `USER.CREATED` | A user is created | Provision the user downstream |
| `USER.UPDATED` | A user is updated | Sync profile changes |
| `USER.DELETED` | A user is deleted | Deprovision |
| `AUTHENTICATION.CREATED` | An authentication is recorded | Sign-in audit trail, anomaly alerts |
| `PASSWORD.RESET` | A password is reset | Notify the user |

## Body Format and Event Structure

With the `ACTIVITY` format (a generic JSON format), the body is a batch of audit events, up to
500 per request:

- `JSON_ARRAY` (`payloadOptions.payloadFormat.https.format`): a JSON array of events
- `ND_JSON`: one JSON event per line

Each event includes, among others:

| Field | Meaning |
|-------|---------|
| `id` | Event identifier (use it to dedupe) |
| `createdAt` | When the event was created (ISO 8601) |
| `action.type` | Event type, e.g. `USER.CREATED` |
| `action.description` | Description of the action |
| `actors` | Who performed the action (`actors.user`, `actors.client`) |
| `resources` | What the action affected |

Other subscription formats (`SPLUNK`, `NEWRELIC`) exist; these examples handle `ACTIVITY`.

## Full Event Reference

For the complete list of audit events, see the
[Audit Reporting Events](https://developer.pingidentity.com/pingone-api/platform/reference/audit-reporting-events.html)
reference, and the
[Subscriptions (webhooks)](https://developer.pingidentity.com/pingone-api/platform/subscriptions-webhooks/)
API for the subscription data model.
