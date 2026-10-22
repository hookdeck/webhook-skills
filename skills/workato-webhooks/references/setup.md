# Setting Up Workato to Send Requests to Your App

## Prerequisites

- A Workato workspace and a recipe that should call your app
- A public HTTPS URL for your endpoint. During development, tunnel to localhost:

```bash
npx hookdeck-cli listen 3000 workato --path /webhooks/workato
```

(Use port `8000` for the FastAPI example.)

## 1. Generate a Password

```bash
openssl rand -hex 32
```

Put it in your app's `.env` as `WORKATO_WEBHOOK_PASSWORD`, and choose a username for
`WORKATO_WEBHOOK_USERNAME` (for example `workato`).

## 2. Create an HTTP Connection with Basic Auth

1. In Workato, add the **HTTP** connector to your recipe and create a connection.
2. **Authentication type**: **Basic**.
3. **Basic auth user**: the value of `WORKATO_WEBHOOK_USERNAME`.
4. **Basic auth password**: the value of `WORKATO_WEBHOOK_PASSWORD`.
5. Click **Connect**.

Workato sends `Authorization: Basic base64(user:password)` on every request made with this
connection.

## 3. Add the HTTP Action

1. Add an HTTP action (for example **Send request**) using that connection.
2. **Request URL**: your endpoint, e.g. `https://your-app.example.com/webhooks/workato`.
3. **Request method**: whichever fits. The examples accept `POST`, `PUT`, `PATCH`, `GET` and
   `DELETE`.
4. For methods with a body, set the request body to JSON and include an `event` field:

```json
{
  "event": "order.created",
  "data": { "order_id": "ord_123" }
}
```

## 4. Test

Run the step (or test the recipe). A `200` response shows `{"received": true}` in the step
output; a `401` means the username or password doesn't match your `.env`.

## Rotating the Credential

The password is static and unsigned requests can't be told from replays, so rotate it if it
leaks: generate a new one, update the HTTP connection in Workato, then update your `.env`.
