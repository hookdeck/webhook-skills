# Setting Up Certn Webhooks

## Prerequisites

- A Certn account with access to the **Partner** tab
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint and Get Your Signing Secret

All webhook management is on the Partner page:

1. Open the **Partner** tab.
2. Enter your webhook URL.
3. Click **Enable Integration**.
4. Turn on signed payloads and copy the secret string.

**Signing is opt-in: turn on signed payloads in Certn and paste the signing secret into `CERTN_WEBHOOK_SECRET`. Without it, deliveries are unsigned and fail verification.** Use the secret exactly as shown, as a UTF-8 string (no base64 decoding).

Notes from Certn:

- The webhook URL can be changed at any time. The secret string cannot be changed; if it is compromised, contact Certn support.
- Secrets are set at the Partner level. Partner resellers use the same webhook and secret across all accounts and sub-accounts.
- Rolling a secret keeps the previous one active for 48 hours, and Certn sends one `v1` signature per active secret.

## Local Development

```bash
npx hookdeck-cli listen 3000 certn --path /webhooks/certn
```

Use the Hookdeck URL as the webhook URL on the Partner page. For FastAPI use port `8000`.

## Testing

Run a check in a demo account and wait for `report_status` to change. Each delivery is the full applicant object, so a handler that logs `id`, `report_status`, and `result` is enough to confirm the setup.

## Respond Quickly

Return a `2xx` as soon as the signature is verified. Certn retries on `408`, `500`, `502`, `503`, and `504`, so use `400` for a bad signature and do the slow work asynchronously.
