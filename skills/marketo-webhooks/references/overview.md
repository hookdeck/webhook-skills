# Marketo Webhooks Overview

## What Are Marketo Webhooks?

Adobe Marketo Engage webhooks let a campaign talk to a third-party web service.
Per Marketo's docs, a webhook "uses the GET or POST HTTP verb to send data to or
retrieve data from a specific URL". You define the webhook once in **Admin →
Webhooks**, then run it from a Smart Campaign with the **Call Webhook** flow step.

Marketo has no event subscriptions, no signing secret and no event-type names.
What arrives at your endpoint is the Payload Template you wrote, with tokens
filled in for the lead that went through the flow step.

## Webhook Properties

| Property | What it does |
|---|---|
| URL | Where the request goes. Characters are sent as written (`&` stays `&`, `%26` stays `%26`) |
| Request Type | The HTTP method: GET or POST |
| Payload Template | The POST body. Any format that works in an HTTP POST, including JSON or XML, as long as strings can be wrapped in double quotes |
| Request Token Encoding | JSON or Form/Url. How token values with special characters (like `&`) are encoded |
| Response Type | JSON or XML. Used to map response properties to lead fields |
| Custom Headers | Key-Value pairs added through **Webhook Actions → Set Custom Header**. Any number, and they can contain tokens |

## Events

Marketo defines **no event strings**. The `event` field in this skill's examples
is a convention: each webhook hard-codes one in its Payload Template so the
handler can dispatch on it.

| `event` (convention) | Example Smart Campaign trigger | Use cases |
|---|---|---|
| `lead_created` | Person is Created | Push new leads to a CRM, data warehouse or Slack |
| `lead_updated` | Data Value Changes | Sync field changes, route a lead after scoring |

You can add more (for example, `form_submitted` for **Fills Out Form**) by
creating another webhook and extending the handler's `switch`.

## Payload Structure

The body is whatever you write. This skill's template:

```json
{
  "event": "lead_created",
  "campaign": "Webinar follow-up",
  "lead": {
    "id": 1042,
    "email": "amy@example.com",
    "first_name": "Amy",
    "last_name": "Chen",
    "company": "Acme Inc"
  }
}
```

Lead and system tokens are always available. Trigger, Campaign and Program
tokens are available in their own scopes, and all webhook fields (URL, template,
headers) are filled in the same context as the flow step. Marketo wraps
string-type tokens in double quotes automatically.

## Delivery Behavior

- Marketo waits up to **30 seconds** for a response, then times out.
- Response mappings only update the lead when the service returns a `2xx`.
- Calls run as part of campaign execution, so a slow endpoint slows the whole
  campaign. Respond quickly and process asynchronously.
- The Call Webhook step is meant for **trigger campaigns**.
- The docs don't describe retries or a delivery ID header.

## Full Reference

See [Marketo's webhook documentation](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/webhooks/webhooks).
