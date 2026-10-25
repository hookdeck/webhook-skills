# Setting Up Jamf Pro Webhooks

## Prerequisites

- A Jamf Pro server with privileges to create webhooks
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 jamf-pro --path /webhooks/jamf-pro` locally)

## Choose a Header Name and Secret

Pick a header name and a long random value, for example:

```json
{"Authorization": "Bearer 6f1c...long-random...a9d2"}
```

The JSON key is the **header name**; the JSON value is the **exact, whole header value**,
including any `Bearer ` prefix you type. Store them in your endpoint as:

```bash
JAMF_PRO_WEBHOOK_HEADER=Authorization
JAMF_PRO_WEBHOOK_SECRET=Bearer 6f1c...long-random...a9d2
```

> Choose Header Authentication on the Jamf Pro webhook and enter the same header name and value here.

## Register Your Endpoint

1. In Jamf Pro, open **Settings**, find **Webhooks** and create a new webhook (menu paths vary by
   Jamf Pro version).
2. Give it a name and enter your endpoint as the webhook URL
   (e.g. `https://example.com/webhooks/jamf-pro`).
3. For **Authentication Type**, choose **Header Authentication**. The field requires key-value pairs
   in JSON format; enter the object from above.
4. Set **Content Type** to **JSON**. The examples assume JSON and return `400` for XML.
5. Choose the **Webhook Event** to listen for. Each Jamf Pro webhook listens for one event, so
   create one webhook per event (they can share a URL and header).
6. Save.

Basic authentication, mTLS and the Hash Signature option are not covered by this skill.

## Test

Trigger the event in Jamf Pro (for example, enroll a test device), or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/jamf-pro \
  -H "Content-Type: application/json" \
  -H "Authorization: $JAMF_PRO_WEBHOOK_SECRET" \
  -d '{"webhook":{"id":1,"name":"test","webhookEvent":"ComputerAdded","eventTimestamp":1761400000000},"event":{"udid":"A1B2C3D4","deviceName":"Mac-1","serialNumber":"C02XXXXXXXXX","jssID":42}}'
```

## Rotating the Secret

Because the value is static, rotate it if it leaks: update the Header Authentication JSON on every
Jamf Pro webhook that uses it and `JAMF_PRO_WEBHOOK_SECRET` at the same time, or requests fail with 401.
