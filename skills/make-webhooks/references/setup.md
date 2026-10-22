# Setting Up Make to Send Requests to Your App

## Prerequisites

- A Make account and a scenario to send from
- A public HTTPS URL for your endpoint (Make rejects plain HTTP and self-signed certificates).
  During development, tunnel to localhost:

```bash
npx hookdeck-cli listen 3000 make --path /webhooks/make
```

(Use port `8000` for the FastAPI example.)

## 1. Generate a Shared Secret

```bash
openssl rand -hex 32
```

Decide the exact header value Make will send. It is sent as typed, so if you type
`Bearer <secret>` the header value includes `Bearer `. Put that same whole value in your
app's `.env` as `MAKE_WEBHOOK_SECRET`.

## 2. Add an HTTP > Make a request Module

1. In your scenario, add **HTTP > Make a request**.
2. **URL**: your endpoint, e.g. `https://your-app.example.com/webhooks/make`.
3. **Method**: `POST` (or `PUT`, `PATCH`, `DELETE`, `GET`; the examples accept all of them).

## 3. Configure Authentication

1. **Authentication type**: **API key**.
2. Click **Add** next to **Choose a key** to create a keychain:
   - **Name**: any label, e.g. `My app webhook`.
   - **Key**: the exact header value from step 1, e.g. `Bearer 3f9a...`. Make sends it as
     entered, including any prefix.
   - **API key placement**: **In the header**. (Query-string placement can't be checked by
     the examples.)
   - **API key parameter name**: the header name, e.g. `Authorization` or `X-Webhook-Secret`.
     Set `MAKE_WEBHOOK_HEADER` in your app to the same name (default `Authorization`).

Make's docs recommend putting credentials in the Credentials field rather than in **Headers**
or query parameters: it keeps keys out of the request definition and lets you rotate them in
one place (**Keys** in the left sidebar).

## 4. Configure the Body

For methods with a body:

1. **Body content type**: `application/json`.
2. **Body input method**: `JSON string`, including an `event` field:

```json
{
  "event": "order.created",
  "id": "{{1.id}}",
  "data": { "order_id": "{{1.orderId}}" }
}
```

For `GET`, leave the body empty. Any content type works with the examples, because the raw
body is only parsed after authentication.

## 5. Test

Right-click the module and choose **Run this module only**. A `200` shows the response in the
output bundle; a `401` means the key value or header name doesn't match your `.env`.
