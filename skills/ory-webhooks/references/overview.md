# Ory Actions Webhooks Overview

## What Are Ory Actions Webhooks?

Ory Network Actions can run a webhook (`hook: web_hook`) at set points in an identity flow:
login, registration, settings, verification and recovery, before or after the flow. Typical uses
are adding a new user to a CRM or newsletter, syncing profile updates, and kicking off workflows.
Ory sends an HTTP request to the URL you configure, with the method, authentication and body you
define. Requests are not signed.

This skill covers non-blocking webhooks (`response.ignore: true`). Ory ignores the response and
runs the call asynchronously. Webhooks with `response.parse: true` can modify the identity or
interrupt the flow from the response; that isn't covered here.

## Event Types

Ory sends no event name of its own. Each action is one flow plus one execution time, and the
body is rendered from your Jsonnet template. The examples assume a template that adds an `event`
field. These names are illustrative:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `registration.after` | After an identity registers | Add to CRM, welcome workflow |
| `login.after` | After a successful login | Audit log, analytics |
| `settings.after` | After profile or trait changes | Sync traits downstream |
| `verification.after` | After an address is verified | Mark verified in other systems |
| `recovery.after` | After account recovery | Security notification |

## Request Payload Structure

The body is whatever your template renders over `ctx`. Documented `ctx` fields include `ctx.flow`,
`ctx.identity` (after-flow hooks), `ctx.request_headers` (a limited allowlist), `ctx.request_method`,
`ctx.request_url`, `ctx.location` and `ctx.ip_labels`. The example template:

```jsonnet
function(ctx) { event: 'registration.after', identity: ctx.identity }
```

renders to:

```json
{
  "event": "registration.after",
  "identity": { "id": "3a5293f1-f4d6-49f4-b34f-6da62c360604", "traits": { "email": "user@example.com" } }
}
```

## Retries

On the Ory Network a failed delivery is attempted up to three times, 30 seconds apart, so make
handlers idempotent (use `identity.id` plus the flow).

## Full Reference

See [Ory's webhook documentation](https://www.ory.com/docs/guides/integrate-with-ory-cloud-through-webhooks).
