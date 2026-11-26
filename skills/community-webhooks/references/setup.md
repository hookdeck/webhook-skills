# Setting Up Community Webhooks

## Prerequisites

- A [Community](https://www.community.com) (community.com) account
- **Webhook permission on your account.** Webhooks require certain permissions
  which may or may not be included in your plan. If the **Configure** option is
  not visible in the Dashboard, email <yourfriends@community.com> to ask about
  access to the feature.
- A **publicly reachable HTTPS endpoint** with a valid SSL certificate for the
  correct host. Community rejects plain HTTP endpoints and verifies the
  certificate.

## Where Webhooks Are Configured

Webhooks can **only** be configured in the Community Dashboard — there is no
API for creating, updating, or listing them.

1. Go to **Settings → Integrations → Webhooks** and click **Configure**
   (this option only appears if you have the appropriate permission), or go
   directly to <https://dashboard.community.com/settings/integrations/webhooks>.
2. Any webhooks you have already configured are listed here. Each can be
   **enabled or disabled** directly from this list.

## Register Your Endpoint

Creating or editing a webhook opens a modal with these fields:

1. **Name** — a label for the webhook.
2. **Endpoint URL** — your HTTPS endpoint. It must accept `POST` requests with a
   JSON body (e.g. `https://api.example.com/webhooks/community`).
3. **Event types** — the events this webhook publishes. Choose from:
   - `message.inbound`
   - `message.outbound`
   - `member.created`
   - `member.updated`
   - `member.deleted`
   - `member.opted_out`
4. **Signature secret** — displayed in the same modal. Copy it now (see below).

## Get Your Signature Secret

The **signature secret** is shown in the webhook modal when the webhook is
created or edited. It is:

- **Unique to each webhook** — not account-wide. If you run several webhooks,
  each has its own secret and you must verify each endpoint with its own.
- **Not** your Async REST API bearer token. That is a separate `community_api`-prefixed
  credential for a different API and will never verify a webhook signature.

Store it as an environment variable:

```bash
COMMUNITY_WEBHOOK_SECRET=your_signature_secret_here
```

Never commit the secret. If you rotate it by editing the webhook, deploy the new
value before saving — requests signed with the new secret will start arriving
immediately.

## Verify Deliveries

Once saved, Community begins sending events for the subscribed types. Your
endpoint must:

- Verify the `community-signature` header — see
  [verification.md](verification.md).
- Return a `200`–`299` status **within 15 seconds**. The response body is
  ignored.

Failures (connection errors, non-2xx, timeouts) are retried up to 5 times with
increasing backoff, for up to an hour from the first attempt. Community emails
you when a webhook keeps failing and **may disable it** — a disabled webhook has
to be re-enabled from the webhooks list once the problem is fixed.

## Testing Locally

There is no test-mode or "send test event" button in the Community Dashboard, and
no sandbox environment for webhooks. To develop against real events, tunnel them
to your machine:

```bash
# Express / Next.js (port 3000)
npx hookdeck-cli listen 3000 community --path /webhooks/community

# FastAPI (port 8000)
npx hookdeck-cli listen 8000 community --path /webhooks/community
```

No account is required — the CLI creates a guest account on first run and gives
you an HTTPS tunnel URL plus a web UI for inspecting and replaying requests.

Paste the HTTPS URL the CLI prints into the **endpoint URL** field of your
webhook in the Community Dashboard.

Then trigger real events:

- `member.created` — have a test phone number join your Community.
- `message.inbound` — text your Community number from that phone.
- `message.outbound` — send a DM to that member from the Dashboard.
- `member.updated` — change a standard personal data field for that member.
- `member.opted_out` and `member.updated` — have the test number text `STOP`.
- `member.deleted` — have the test member delete themselves.

Because Community delivers **at-least-once**, expect and handle duplicate
deliveries even during local testing. Deduplicate on the event `id`.

## Related

- [overview.md](overview.md) - Event types, payload structure, delivery semantics
- [verification.md](verification.md) - `community-signature` verification details
- [Community webhook documentation](https://developer.community.com/reference/webhooks-introduction)
