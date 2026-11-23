# Setting Up Voiceflow Webhooks

## Prerequisites

- A Voiceflow organization where you can change organization settings (organization events), or
  a project where you can open its settings (session lifecycle events)
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## Two Webhook Scopes

Voiceflow has two webhook scopes. Both are delivered and signed by Svix with the same scheme, and
each has its own endpoint URL and signing secret:

- **Organization event webhooks**, in dashboard **Settings → Organization**: projects created or
  deleted, and environments created, published, merged or deleted.
- **Session lifecycle webhook**, in a project's **Settings → Webhooks**: sessions and voice calls
  starting and ending.

Use a separate endpoint per scope (or look up the secret per scope), because a secret from one
scope won't verify the other's deliveries. The handlers in this skill reject requests without
signature headers with `400`. Don't add a fallback that processes an unsigned body.

## How Do I Register an Organization Webhook URL?

1. Open dashboard **Settings → Organization** and find **Organization event webhooks**.
2. Enter your endpoint in **Webhook url**, e.g. `https://example.com/webhooks/voiceflow`, leave
   the field and wait for **Saved**.
3. Choose **Listen for all events** or **Listen for specific events**, and select individual
   events or a whole category. Keep at least one selected.
4. Copy **Webhook secret** into `VOICEFLOW_WEBHOOK_SECRET`.

Changing these settings needs organization update access; without it the form is read-only.

## How Do I Register a Session Lifecycle Webhook URL?

1. Open the project's **Settings → Webhooks**.
2. Enter your endpoint in **Webhook url**, leave the field and wait for **Saved**.
3. Choose **Listen for all events** or **Listen for specific events**. Voiceflow suggests
   **Session ended** for conversation follow-up and **Call ended** for voice-call details.
4. Click **Copy** beside **Webhook secret** and store it for this endpoint.

Neither scope documents a challenge or validation request.

## Where Do I Find the Signing Secret?

**Webhook secret** sits in the same settings form as the URL. Voiceflow doesn't print an example
value, but Svix secrets start with `whsec_`. Store the full value, prefix included:

```bash
VOICEFLOW_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key.

## Rotating the Secret

Use **Regenerate key** beside **Webhook secret** and confirm with **Yes**. The previous secret
stays valid for 24 hours, so during that window deliveries may carry two `v1,` entries in
`svix-signature`. The examples accept any matching entry, so deploy the new secret during that
window.

## Firewalls

Voiceflow says these requests come from Svix's delivery infrastructure. Use
[Svix's source IP addresses](https://docs.svix.com/receiving/source-ips) if your endpoint
restricts incoming IPs.
