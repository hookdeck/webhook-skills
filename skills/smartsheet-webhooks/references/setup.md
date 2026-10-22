# Setting Up Smartsheet Webhooks

Smartsheet webhooks are created through the API; there is no webhook screen in the Smartsheet UI.

## Prerequisites

- Smartsheet account with a [personal API access token](https://developers.smartsheet.com/api/smartsheet/guides/basics/authentication) (Account > Personal Settings > API Access)
- Access to the sheet you want to watch
- An HTTPS endpoint (port 443, 8000, 8008, 8080 or 8443) with a CA-signed certificate that answers the verification challenge

## Register Your Endpoint

1. Deploy your handler (or run `npx hookdeck-cli listen 3000 smartsheet --path /webhooks/smartsheet` for a temporary HTTPS URL).
2. Create the webhook:
   ```bash
   curl https://api.smartsheet.com/2.0/webhooks \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/json" \
     -X POST \
     -d '{
       "name": "My sheet webhook",
       "callbackUrl": "https://example.com/webhooks/smartsheet",
       "scope": "sheet",
       "scopeObjectId": 3285357287499652,
       "events": ["*.*"],
       "version": 1
     }'
   ```
   Use `["row.created", "cell.updated"]` to limit events.
3. The response contains the webhook `id` and its `sharedSecret`. Store the secret as `SMARTSHEET_SHARED_SECRET`.
4. Enable the webhook (new webhooks are disabled until verified):
   ```bash
   curl https://api.smartsheet.com/2.0/webhooks/WEBHOOK_ID \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/json" \
     -X PUT -d '{"enabled": true}'
   ```
5. Smartsheet sends a request with a `Smartsheet-Hook-Challenge` header and a JSON body `{"challenge": "...", "webhookId": ...}`. Your endpoint must return 200 and echo the value in the `Smartsheet-Hook-Response` header (or `smartsheetHookResponse` in a JSON body). On success the webhook becomes `enabled: true`, `status: "ENABLED"`.

Verification is ongoing: expect another challenge about every 100 callbacks.

## Shared Secret

- Each webhook has its own randomly generated `sharedSecret`.
- Rotate it with the reset shared secret operation (`POST /webhooks/{webhookId}/resetsharedsecret`) and update `SMARTSHEET_SHARED_SECRET`.

## Re-enabling a Disabled Webhook

`DISABLED_CALLBACK_FAILED`, `DISABLED_VERIFICATION_FAILED` and `DISABLED_BY_OWNER` webhooks can be re-enabled with `PUT /webhooks/{id}` and `{"enabled": true}` once your endpoint passes the challenge. `DISABLED_SCOPE_INACCESSIBLE` re-enables itself when access returns. `DISABLED_APP_REVOKED` is terminal.

## Testing

There is no test-mode. Create a webhook on a scratch sheet, add a row, and watch the request arrive. Avoid writing back to the same sheet from the handler without a guard, which can loop (see Smartsheet's "Preventing webhook infinite loops" guide).
