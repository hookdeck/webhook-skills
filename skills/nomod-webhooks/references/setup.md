# Setting Up Nomod Webhooks

## Prerequisites

- A Nomod account where you are an **Owner or Admin** (Managers and Staff don't see the Webhooks
  option)
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Create a Nomod Webhook?

1. In the Nomod dashboard go to **Settings > Tools & customisations > Apps & APIs**.
2. Select **Webhooks > Create webhook**.
3. Select an integration type, **Nomod API** or **Nomod Hosted Checkout**, then tap **Continue**.
   A webhook belongs to exactly one type.
4. Select one or more events, then tap **Continue**. The events are `charge.created`,
   `charge.authorised`, `charge.completed`, `charge.failed`, `charge.cancelled`,
   `charge.refunded`, `charge.partially_refunded` and `charge.dispute.created`. An event can be
   added to more than one webhook.
5. Enter a name for the webhook and the URL of your endpoint, then tap **Create webhook**.

Nomod doesn't send a challenge or handshake. It begins sending notifications for the events you
selected as soon as the webhook exists. For local work, use the tunnel URL from
`npx hookdeck-cli listen 3000 nomod --path /webhooks/nomod`.

## Where Do I Find the Signing Secret?

Go to **Settings > Tools & customisations > Apps & APIs > Webhooks**, select your webhook, and copy
the value of the **Signing secret** field (masked by default). It is per webhook and starts with
`whsec_`. Store the full value, prefix included, as an environment variable and don't hardcode it:

```bash
NOMOD_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key.

## How Do I Rotate the Signing Secret?

Select the webhook, find the **Signing secret** field, tap the rotate icon, then tap **Generate**
in the confirmation prompt. The new secret takes effect immediately, and the **old secret stays
valid for 24 hours**. Update `NOMOD_WEBHOOK_SECRET` within that window. While both are valid,
`svix-signature` can carry more than one `v1,` entry, and the examples accept any matching entry.

## Managing, Monitoring and Replaying

- **Edit** a webhook's name, URL or events at any time, and **delete** it to stop all future
  notifications (permanent).
- **Events** tab (per webhook, or across all webhooks): delivery status, integration type, Event
  Log ID, Webhook ID, Webhook URL and the full JSON payload, which you can copy or download.
  Event logs are kept for 90 days.

## Verification Behind Hookdeck

If the endpoint URL points at a Hookdeck source, Hookdeck verifies the signature on ingest and
forwards to your handler. Retries and replays resend the original `svix-timestamp`; see
[verification.md](verification.md) for how that interacts with the library's 5-minute window.
