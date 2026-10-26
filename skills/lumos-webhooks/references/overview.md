# Lumos Webhooks Overview

## What Are Lumos Webhooks?

Lumos (identity governance) supports four types of inline webhooks. Each calls an external URL so
you can automate an access change in a system Lumos can't manage directly. Webhooks are sent
over HTTPS (plain HTTP is rejected when you configure the webhook), redirects are not followed,
and outbound traffic leaves from a fixed set of IP addresses listed in Lumos's "Lumos IP
addresses" help page, so you can also allowlist them.

> Use notification webhooks such as provisioning and deprovisioning. Pre-approval and request validation webhooks expect a decision back and aren't supported.

## Webhook Types

| Type | Supported here | Triggered When | Common Use Cases |
|------|----------------|----------------|------------------|
| Provisioning | Yes | Access is approved for an application, resource or permission | Grant a Zendesk agent license |
| Deprovisioning | Yes | Access is removed | Offboarding, time-boxed access |
| Pre-Approval | No | Lumos evaluates a request for pre-approval | Pre-approve AWS access for on-call engineers |
| Request Validation | No | An employee requests access | Block requests until training is complete |

Pre-Approval and Request Validation hooks expect a decision in the response, which Hookdeck
can't return. Lumos doesn't use event-name strings; the webhook type is chosen when you
configure the hook.

## Payload Structure

Lumos doesn't publish field names. Per Lumos's webhook security article, a deprovisioning
payload contains:

- the user: email address, given name and family name
- the account on the target application: the application's own identifier, plus email and username where they exist
- the application: name and instance identifier
- the permissions or entitlements being removed, by name
- a comment describing the reason
- custom fields, only if your team configures them for that application

The examples use this **illustrative** payload (field names are not from Lumos):

```json
{
  "user": { "email": "ada@example.com", "given_name": "Ada", "family_name": "Lovelace" },
  "account": { "id": "acct_123", "email": "ada@example.com", "username": "ada" },
  "application": { "name": "Zendesk", "instance_id": "inst_456" },
  "permissions": ["Agent License"],
  "comment": "Offboarding"
}
```

Inspect a real delivery (for example in the Hookdeck CLI) before relying on field names.

## Authentication

Requests are authenticated with a custom header you add to the webhook. Lumos also sends an
HMAC-SHA256 signature in `X-Lumos-Webhook-Signature`, which this skill does not verify; see
[verification.md](verification.md).

## Full Reference

See [Lumos's webhook documentation](https://developers.lumos.com/docs/webhooks) and
[Webhook Security for Offboarding Payloads](https://lumos.help.usepylon.com/articles/9414083876-webhook-security-for-offboarding-payloads).
