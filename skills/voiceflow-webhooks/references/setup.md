# Setting Up Voiceflow Webhooks

## Prerequisites

- A Voiceflow organization where you can open the organization settings
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## Only Organization Event Webhooks Are Supported

Hookdeck's configuration alert for this source reads: "Only organization event webhooks are
supported. The project-level session webhook doesn't document this signing scheme and may fail
verification."

- **Organization events webhooks** are delivered and signed by Svix: project and environment
  lifecycle events. This is what this skill verifies.
- **The project-level session webhook** (the session lifecycle webhook) doesn't document this
  signing scheme, so don't expect `svix-*` headers on it.

The handlers in this skill reject requests without signature headers with `400`. Don't add a
fallback that processes an unsigned body.

## How Do I Register a Voiceflow Webhook URL?

1. In the Voiceflow dashboard, click **Settings** in the bottom left corner, then select
   **Organization**.
2. Enter the URL you want events sent to, e.g. `https://example.com/webhooks/voiceflow`.
3. Once a URL is set, every future organization event is sent to it. There is no per-event
   selection and no challenge or validation request.

If you'd rather not run code, Voiceflow suggests a no-code tool such as Make to generate a
webhook URL, but then signature verification is up to that tool.

## Where Do I Find the Signing Secret?

Once you enter a webhook URL, Voiceflow provides a webhook secret automatically, shown on the same
Organization settings page. There is one secret per organization webhook URL. Voiceflow doesn't
print an example value, but Svix secrets start with `whsec_`. Store the full value, prefix included:

```bash
VOICEFLOW_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key.

## Rotating the Secret

Regenerate it with the refresh button on the settings page. The previous secret stays valid for
24 hours, so during that window deliveries may carry two `v1,` entries in `svix-signature`. The
examples accept any matching entry, so deploy the new secret during that window.

## Firewalls

Events come from [Svix's IP addresses](https://docs.svix.com/receiving/source-ips), not
Voiceflow's. Allowlist those if your endpoint sits behind a restrictive firewall.
