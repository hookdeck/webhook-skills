# Setting Up HaloPSA Webhooks

## Prerequisites

- A Halo instance (HaloPSA, HaloITSM or HaloCRM) with access to Configuration > Integrations
- A public HTTPS URL for your endpoint. During development, tunnel to localhost:

```bash
npx hookdeck-cli listen 3000 halo-psa --path /webhooks/halo-psa
```

(Use port `8000` for the FastAPI example.)

## 1. Generate a Password

```bash
openssl rand -hex 32
```

Put it in your app's `.env` as `HALO_PSA_WEBHOOK_PASSWORD`, with a username of your choice as
`HALO_PSA_WEBHOOK_USERNAME`.

## 2. Create the Webhook

1. Go to **Configuration > Integrations > Webhooks > New**.
2. **Webhook Name**: a label for the UI.
3. **Payload URL**: your endpoint, e.g. `https://your-app.example.com/webhooks/halo-psa` (or the
   Hookdeck source URL).
4. **Webhook Type**: **Standard webhook** (unless you are using a pre-configured webhook).
5. **Method**: **POST**. GET is for retrieving data; notifications are POSTs.
6. **Authentication**: **Choose Basic Authentication on the Halo webhook.** Enter the username
   and password from step 1.
7. **Payload**: choose the payload type. (Optional) turn on **Use lightweight logs** for very
   large payloads; you then can't re-send webhooks from the logs.
8. **Events**: add at least one, e.g. `New Ticket Logged` or `Ticket Reassigned`. Add
   conditions if needed.
9. (Optional) set **Batching**; the body then becomes a JSON array.
10. Save.

## 3. Confirm Delivery

When an event fires, a record appears on the webhook's **Deliveries** tab with the payload and
your endpoint's response. If you see `401`, see
[verification.md](verification.md#how-do-i-debug-401s-from-a-halo-webhook).

## Credentials Must Arrive on the First Request

The Halo documentation doesn't say whether Basic credentials are sent preemptively. Your
endpoint (and Hookdeck) must accept them on the first request: Hookdeck never sends a
`401` + `WWW-Authenticate` challenge, it verifies the request as received.

## Hookdeck

In Hookdeck, create a source of type **HaloPSA** (`HALO_PSA`) and enter the same username and
password. Hookdeck then verifies the Basic Authentication header before forwarding to you.
