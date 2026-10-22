# Setting Up the RudderStack HTTP Webhook Destination

## Prerequisites

- A RudderStack workspace with a source to forward events from
- A public HTTPS endpoint for your webhook receiver (use the Hookdeck CLI locally)

## Add the Destination

1. In the RudderStack dashboard, add or open a source, then add a destination and choose
   **HTTP Webhook**.
2. Name the destination and click **Continue**.
3. Set **Base URL** to your endpoint, e.g. `https://example.com/webhooks/rudderstack`.
   HTTPS needs a valid TLS certificate.
4. Set **Authentication** to **Basic Auth** and enter a **Username** and **Password**. Store
   them as `RUDDERSTACK_WEBHOOK_USERNAME` and `RUDDERSTACK_WEBHOOK_PASSWORD`. RudderStack sends
   `Authorization: Basic base64(username:password)`.
5. Choose the **Method** (default `POST`; the examples accept `POST`, `PUT`, `PATCH`, `GET`
   and `DELETE`) and **Body Format** (use **JSON** for these examples).
6. Optionally open **Set up mapping** for path/query parameters, headers and the request body.
   Leave **Send the event payload as is** on to receive the RudderStack event unchanged.
7. Optionally enable **Batching** (JSON only, max batch size 100).
8. Connect the source and save.

The destination also offers **No Auth**, **Bearer Token** and **API Key**. This skill covers
Basic Auth only; don't use No Auth on a public endpoint.

## Local Testing

```bash
npx hookdeck-cli listen 3000 rudderstack --path /webhooks/rudderstack
```

Use the printed URL as the Base URL. For FastAPI, use port `8000`.

## Rotating the Credential

The credential is static. Change the username/password on the destination and in your
environment together, and rotate it if it leaks.
