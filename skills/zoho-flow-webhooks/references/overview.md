# Zoho Flow Webhooks Overview

## What Are Zoho Flow Outgoing Webhooks?

Zoho Flow connects apps with flows: a trigger (a new form entry, a CRM record, a schedule) followed by actions. The **Send Webhook** action, under Builder > Logic > Webhooks, makes an HTTP request to any URL. Zoho calls these **outgoing webhooks**. Use them to call your own API from a flow, or apps Flow has no built-in actions for, including on-premises apps through an On-Prem Agent.

The request is whatever you configure on the action. Zoho Flow doesn't sign it or add an event name, timestamp or delivery ID.

Don't confuse this with Flow's **webhook trigger**, which gives you a Zoho Flow URL that other apps call to start a flow.

## What You Configure on the Action

| Setting | Options |
|---------|---------|
| Connection | **Use a connection** (built on an auth profile) or **No Authentication** |
| Request | `GET`, `PUT`, `POST`, `PATCH` or `DELETE` |
| HTTP URL | Your endpoint (avoid spaces) |
| Headers, body, query | Param Name / Param Value pairs, with values mapped from earlier steps |
| Content-Type | The body format: "typically JSON" |
| Response Type | How Flow reads your response (for example JSON, XML or Auto); keys in a JSON response become variables for later steps after one test |
| Show header data | Exposes your response headers as variables |

## Authentication Options

Auth profiles (Settings > Auth Profiles) store how to authenticate. The types are Basic Auth, OAuth v1.0a, OAuth v2, JWT Auth and **API Key**. A connection (Settings > Connections) uses an auth profile plus the actual credential.

For your own endpoint, the simplest options are:

- **API Key auth profile** with the key placed in a header. The profile's **Parameter Name** becomes the header name, and the value you enter on the connection becomes the header value.
- **No Authentication** on the action, plus a header Param Name and Param Value typed on the action itself.

Both send a static header your handler compares (see [verification.md](verification.md)). Basic Auth also works if your framework checks it; this skill uses a named header so the same check works with Hookdeck's Zoho Flow source type.

## Payload

Because the body is yours, this skill's examples use an **illustrative** JSON body with an `event` field you add to tell flows apart:

```json
{
  "event": "deal.won",
  "deal_id": "D-1042",
  "amount": 12500,
  "owner_email": "sam@example.com"
}
```

With `GET` (and often `DELETE`) the data goes in the query string instead, e.g. `/webhooks/zoho-flow?event=deal.won&deal_id=D-1042`. The examples use the query parameters as the payload when the body is empty.

## What Isn't Documented

Zoho's outgoing webhooks page doesn't describe a retry policy, a timeout or a delivery ID. Treat a failed call as a failed flow step (check the flow's history) and respond quickly with `2xx`. If the same flow can run twice for one source record, include an ID from the trigger in the payload and dedupe on it.

## Full Reference

- [Outgoing webhooks (Zoho Flow help)](https://help.zoho.com/portal/en/kb/flow/user-guide/create-a-flow/webhook/articles/outgoing-webhooks)
