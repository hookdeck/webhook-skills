# Setting Up FourKites Webhooks

## Prerequisites

- A FourKites account licensed for Callbacks / Webhooks (ask your Customer Success Manager, or
  use "Talk to Support" on the Webhooks page of FourKites Connect)
- A publicly reachable HTTPS endpoint (locally: `npx hookdeck-cli listen 3000 fourkites --path /webhooks/fourkites`)

## Choose Your Credentials

You choose the Basic username and password and give them to FourKites. Store them as:

```bash
FOURKITES_WEBHOOK_USERNAME=your-username
FOURKITES_WEBHOOK_PASSWORD=your-password
```

Use long random values; they are the only protection on the endpoint.

## Register Your Endpoint

FourKites subscribes a URL for you; supply these details (via your Implementation Manager,
Customer Success Manager or a support case):

| Field | Value |
|-------|-------|
| URL | `https://example.com/webhooks/fourkites` |
| Callback Message(s) | e.g. `LOAD_CREATION`, `TRACKING_UPDATE`, `STOP_ARRIVAL`, `STOP_DEPARTURE` |
| Authentication Method | **Basic Auth** |
| Additional Headers | Optional |

## Basic Auth Must Be Sent on the First Request

The docs don't say whether FourKites sends Basic credentials preemptively. This skill assumes it
does. A `401` + `WWW-Authenticate` challenge flow won't work through Hookdeck, which verifies the
request as received, so confirm with FourKites that the `Authorization` header is on every request.

## Staging vs Production

FourKites has staging and production environments; subscribe each URL separately. Static IP
ranges for both can be requested from FourKites if you want an allowlist as well.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/fourkites \
  -u "$FOURKITES_WEBHOOK_USERNAME:$FOURKITES_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"MessageType":"STOP_ARRIVAL","FourKitesLoadId":1234,"LoadNumber":"BOL12345"}'
```
