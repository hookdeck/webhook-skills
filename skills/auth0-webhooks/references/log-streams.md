# Auth0 Custom Log Streams

Custom Log Streams are a separate Auth0 feature from Event Streams. They export
your tenant's **logs** (logins, failed logins, signups and so on) to an HTTPS
endpoint, for monitoring and analytics. If you need user, organization or group
lifecycle events, use Event Streams instead (see [overview.md](overview.md)).

## How They Differ From Event Streams

| | Event Streams | Custom Log Streams |
|---|---|---|
| What | Lifecycle events (`user.created`, ...) | Tenant log records |
| Body | One CloudEvents object | One or more log records |
| Event type | Top-level `type` | `data.type` code on each record, such as `s` or `f` |
| Credential | Bearer, basic or custom header | Optional **Authorization Token**, sent verbatim |

## Setup

1. Go to **Auth0 Dashboard > Monitoring > Streams**, select **Create Stream**
   and choose **Custom Webhook**.
2. Set the **Payload URL**, **Content Type** (`application/json`) and
   **Content Format**. JSON lines, arrays and objects are offered. JSON Array
   sends one JSON array per request. JSON Lines sends newline-delimited objects,
   which a standard JSON body parser rejects.
3. Set the **Authorization Token**. Auth0 sends exactly what you type as the
   `Authorization` header, so if you enter `Bearer abc123`, compare against
   `Bearer abc123`.

## Verification

Log Streams aren't signed. Compare the whole `Authorization` header with the
token you configured, using a timing-safe comparison, as in
[verification.md](verification.md) but without adding a `Bearer ` prefix.

## Records

With JSON Array, each element looks like this:

```json
{
  "log_id": "90020210714154213417000000000000000000000000000000",
  "data": {
    "date": "2021-07-14T15:42:13.410Z",
    "type": "s",
    "description": "Successful login",
    "client_id": "AbC123ClientId",
    "user_id": "auth0|64f0000000000000000000001"
  }
}
```

Dispatch on `data.type`. Common codes are `s` (success login), `f` (failed
login), `ss` (success signup), `fs` (failed signup), `sepft` (password
exchanged for an access token) and `slo` (success logout). `log_id` identifies
each record, which helps when a batch is redelivered. Fields vary by code, so
read them defensively.

## Reference

- [Custom Log Streams (Webhooks)](https://auth0.com/docs/customize/log-streams/custom-log-streams)
- [Log Event Type Codes](https://auth0.com/docs/deploy-monitor/logs/log-event-type-codes)
