# Setting Up OneSpan Sign Callbacks

## Prerequisites

- A OneSpan Sign account (sandbox or production) with admin access and an API key
- A public HTTPS endpoint for your receiver (use the Hookdeck CLI locally)

## Register in the Web UI

1. Log in to OneSpan Sign and go to **Admin > Event Notification**.
2. Enter your **Callback URL** (required), e.g. `https://example.com/webhooks/onespan`.
3. Choose the **Authentication Method**: None, Basic or OAuth 2.0.
   - **Basic**: enter a secure **Callback Key**. OneSpan sends it as
     `Authorization: Basic {callbackKey}`. This is the method the skill's examples handle.
   - **None**: no credential is sent, so nothing authenticates the caller.
   - **OAuth 2.0** needs a client ID, client secret, authorization server URL and scope. The docs
     don't describe the resulting header; this skill covers Basic callback keys only.
4. Toggle on the event types you want (Account or Participant generated). All are off by default.
5. Click **Save** (**REVERT** disables all notifications).
6. Store `Basic ` plus the key as `ONESPAN_AUTHORIZATION`.

## Register via the API

```
POST /api/callback
Accept: application/json
Content-Type: application/json
Authorization: Basic <your api key>
```

```json
{
  "url": "https://example.com/webhooks/onespan",
  "key": "secureKey#1",
  "events": ["PACKAGE_CREATE", "PACKAGE_DECLINE", "PACKAGE_COMPLETE"]
}
```

`url`, `key` and `events` are all editable. The API host is `https://sandbox.esignlive.com/api`
for sandbox (use the production host for production). With the example above, set
`ONESPAN_AUTHORIZATION=Basic secureKey#1`.

Note the `Authorization: Basic <api key>` here is OneSpan authenticating **you**; it is a different
credential from the callback key OneSpan sends **to** your endpoint.

## FedRAMP Users

For Sandbox after September 16, 2026 and Production after October 7, 2026, new or changed
outbound destinations must be submitted to OneSpan Support to be allowlisted first. Only the
callback URLs are needed.

## Local Testing

```bash
npx hookdeck-cli listen 3000 onespan --path /webhooks/onespan
```

Use the printed URL as the callback URL. For FastAPI, use port `8000`. A public URL is required;
localhost alone won't work.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/onespan \
  -H "Content-Type: application/json" \
  -H "Authorization: $ONESPAN_AUTHORIZATION" \
  -d '{"name":"PACKAGE_COMPLETE","sessionUser":"e00696ec-d6f5-4feb-89c5-a5ce002a6c66","packageId":"5n4obeO8jYoPp126Cm-Y3fxdfbo="}'
```
