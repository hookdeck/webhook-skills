# Setting Up Neon Auth Webhooks

## Prerequisites

- A Neon project with **Neon Auth** enabled
- Access to the Neon API (an API key) or the Neon Console
- A publicly reachable **HTTPS** endpoint (HTTPS is required)

## There Is No Signing Secret

Neon Auth uses **asymmetric** signing (Ed25519 / detached JWS). Instead of copying a
shared secret, your endpoint fetches Neon's **public keys** from the JWKS endpoint and
verifies each request against them:

```
${NEON_AUTH_URL}/.well-known/jwks.json
```

Set `NEON_AUTH_URL` to the **Auth URL** shown in the Neon Console under **Settings** >
**Better Auth** > **Project Info**. Each branch has its own Auth URL, so use the one for
the branch whose webhooks you configure. Nothing sensitive is stored on your side.

## Register Your Endpoint

Neon Auth webhooks are configured **per project and per branch** in the Neon Console
(**Settings** > **Better Auth** > **Webhooks**), with
`neon neon-auth config webhook update`, or with
`PUT /projects/{project_id}/branches/{branch_id}/auth/webhooks`. Each branch has one
configuration:

1. Set your webhook **URL**: a public HTTPS hostname. Raw IPs, localhost, private
   addresses and redirects are rejected.
2. Enable the **events** you want to receive (see below).
3. Optionally set the per-attempt timeout, 1 to 10 seconds (default 5).

Because config is scoped to a branch, you can point a development branch at a tunnel (see
Local Testing) and production at your deployed endpoint.

## Recommended Events

Start with the events your integration needs:

- `user.created` — sync new users to your database / CRM (non-blocking)
- `phone_number.verified` — react to phone verification (non-blocking)
- `user.before_create` — validate or reject signups (**blocking**; must answer with `{"allowed": true}` or `false`)
- `send.otp` / `send.magic_link` — only if you deliver OTP / magic links yourself (**blocking**); subscribing turns off Neon's built-in email for that event
- `organization.invitation.created` / `organization.invitation.accepted` — custom invitation emails and member provisioning (non-blocking)

## Blocking Events Need Fast Responses

`send.otp`, `send.magic_link`, and `user.before_create` **pause the authentication flow**
until your endpoint responds. Do the minimum synchronously and offload heavy work to a
queue so you don't stall or time out the user's login. `user.before_create` fails closed:
if your endpoint is unreachable or returns anything other than a `2xx` JSON body with
`allowed`, the signup is rejected. Because one URL receives every enabled event on a
branch, enable `user.before_create` only when that URL is your own handler that answers
it.

## Local Testing

Use the Hookdeck CLI to receive live webhooks on your machine — no account required:

```bash
npx hookdeck-cli listen 3000 neon --path /webhooks/neon
```

Point a **development branch's** webhook URL at the tunnel URL the CLI prints, then trigger
an auth event (sign up a test user) to see deliveries. Neon has no test events, event logs
or redelivery, so real auth actions are the only way to trigger one. Leave
`user.before_create` disabled on a branch whose URL doesn't answer it, or sign-ups fail.

## Retries

Neon makes up to **3 attempts** (1 initial + 2 retries) immediately, with no backoff, inside
a 15-second budget from the start of the first. It retries 5xx, 429, 408 and network errors,
and not other 4xx. The attempt number is in the `X-Neon-Delivery-Attempt` header. Retries
send the same `X-Neon-Event-Id`, so make your handler **idempotent** on it.
