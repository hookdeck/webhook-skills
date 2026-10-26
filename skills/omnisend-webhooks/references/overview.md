# Omnisend Webhooks Overview

## What Are Omnisend Webhooks?

Omnisend does not have account-level webhook subscriptions. Webhooks come from the **send
webhook** action (`sendWebhook` block) in an automation workflow. When a contact reaches that
block, Omnisend sends an HTTP `POST` to your `callbackUrl` with:

- `Content-Type: application/json`
- the custom headers you configured (up to 15)
- the JSON body template you wrote, with personalization tags resolved to real values

The action is available on paid Omnisend plans only, not the free plan.

## Is the Request Signed?

No. There is no signature, timestamp or message ID. Authenticate with a secret header you add
to the action (the docs suggest `X-Webhook-Secret`), and optionally allowlist Omnisend's static IPs
(`34.170.162.11`, `34.56.62.59`, `34.56.108.215`, `34.133.59.36`, `34.58.66.146`, `35.184.130.5`,
`35.232.14.89`). See [verification.md](verification.md).

## Event Names

There is no fixed list of webhook events. The `event` field exists only if you put it in the body
template. The official example does exactly that:

```json
{"contactEmail": "[[contact.email]]", "contactName": "[[contact.first_name]]", "event": "subscribed"}
```

| `event` value | Meaning |
|---------------|---------|
| `subscribed` | From the guide's example: automation triggered by `subscribed to marketing` |
| `placed order` | Example: automation triggered by `placed order` |

Automation trigger events (the `trigger.condition.event` value, such as `subscribed to marketing`
or `placed order`) are not sent as a field unless you template them in.

## Payload Structure

The payload is whatever JSON your template produces (max 64 KB). Supported tags:

| Tag | Resolves to |
|-----|-------------|
| `[[contact.email]]` | Contact email |
| `[[contact.first_name]]` | First name |
| `[[contact.last_name]]` | Last name |
| `[[contact.phone_number]]` | Phone number |
| `[[event.raw.<property>]]` | A property of the triggering event |

## Full Reference

- [How to send webhooks from automation workflows](https://api-docs.omnisend.com/docs/how-to-send-webhooks-from-automations)
