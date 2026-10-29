# Setting Up Bitculator Webhooks

Bitculator webhook endpoints are registered through the Data API v1, not a dashboard form. The documentation describes no UI steps, so this guide uses the API.

## Prerequisites

- A Bitculator account with an API key that has the `data-api` ability (sent as a Bearer token)
- A public **HTTPS** URL for your receiver (use the Hookdeck CLI locally). Non-public hosts are not accepted
- A free slot: at most 5 endpoints per account

## Register Your Endpoint and Get Your Signing Secret

```bash
curl -X POST https://bitculator.com/api/v1/webhooks \
  -H "Authorization: Bearer $BITCULATOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/webhooks/bitculator", "events": ["alarm.triggered"]}'
```

The response includes the signing `secret` (for example `whsec_k5cQ1x9jJ2mW7pR4tY8uB3nV6zA0sD5f`). **It is shown only once, so store it immediately** as `BITCULATOR_WEBHOOK_SECRET`. Use it exactly as returned: the whole string, `whsec_` prefix included. Do not strip the prefix or base64-decode it.

In Hookdeck, create a source of type **Bitculator** and paste the same signing secret. Hookdeck's source verifies the signature.

## Alarms

The alarm items returned by `GET /api/v1/alarms` include a `notification` field (documented value `"webhook"`), `status` (`"active"` / `"triggered"`) and the target `metric`, `direction` and `target`. See the [Bitculator API documentation](https://bitculator.com/en/documentation/api/v1) for how alarms are created.

## Manage Endpoints

| Request | Purpose |
|---------|---------|
| `GET /api/v1/webhooks` | List endpoints |
| `DELETE /api/v1/webhooks/{id}` | Remove an endpoint |
| `POST /api/v1/webhooks/{id}/test` | Fire a signed `alarm.triggered` test event (`test: true` in the payload, real signature headers) |
| `GET /api/v1/webhooks/{id}/deliveries` | Delivery log kept for 30 days: event, `response_status`, `error`, `attempts`, `delivered_at` |

## Send a Test Event

```bash
curl -X POST https://bitculator.com/api/v1/webhooks/$WEBHOOK_ID/test \
  -H "Authorization: Bearer $BITCULATOR_API_KEY"
```

The test delivery carries real signature headers, so it exercises your verification end to end.

## Timestamp Window

Bitculator's own verification example rejects timestamps that are 300 seconds or more from now. The examples leave that window off by default (`BITCULATOR_WEBHOOK_TOLERANCE_SECONDS` unset or `0`); set `300` to opt in when Bitculator calls you directly. Behind Hookdeck keep it off: retries and replays resend the original timestamp.

## Local Development

```bash
npx hookdeck-cli listen 3000 bitculator --path /webhooks/bitculator
```

Use the Hookdeck URL as the endpoint `url`. For FastAPI use port `8000`.
