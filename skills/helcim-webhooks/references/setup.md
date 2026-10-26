# Setting Up Helcim Webhooks

## Prerequisites

- A Helcim account with access to **All Tools > Integrations**
- A public HTTPS URL for your handler (use the Hookdeck CLI for local development)

## How Do I Enable Webhooks?

1. Log in to your Helcim account.
2. Click **All Tools**, then **Integrations**.
3. Click **Webhooks**.
4. Toggle **Webhooks ON**.
5. Enter your **Deliver URL**: the secure address Helcim sends events to.
6. Select the events you want: **Card Transaction** (`cardTransaction`) and **Processing Account Cancel** (the dashboard's second option; the docs describe `terminalCancel` as payments cancelled on the device).
7. Click **Save**.

There is one Deliver URL per account, with a toggle per event. The URL must use `https` and **cannot contain the word "Helcim"**. The examples' local route is `/webhooks/helcim`, so if you deploy one directly, expose it under a different public path (for example `/hooks/payments`) or put Hookdeck in front, whose source URL doesn't contain the word. An event is only sent when its option is enabled.

## Where Is My verifierToken?

On the same **Integrations > Webhooks** page: Helcim shows your `verifierToken` in the webhook settings. It is bare base64, with no `whsec_` prefix. Store it exactly as shown in `HELCIM_WEBHOOK_SECRET`. The `standardwebhooks` library base64-decodes it to get the HMAC key. Keep it out of client-side code and version control.

## How Do I Use Hookdeck With Helcim?

Hookdeck base64-decodes only secrets that start with `whsec_`, so paste the verifierToken into the Helcim source as `whsec_` followed by the token. Hookdeck's configuration alert for this source reads exactly:

> Paste your verifierToken as whsec_ followed by the token, or verification fails.

Without the prefix, Hookdeck would use the token as raw text instead of decoding it, and every delivery fails verification. Your own handler behind Hookdeck still uses the token as Helcim shows it (the library accepts it with or without `whsec_`).

Then set the Hookdeck source URL as the Deliver URL in Helcim (it must not contain "Helcim"). Hookdeck also reads `svix-*` headers when `webhook-id` is absent, and the examples do the same.

## How Do I Test an Endpoint?

Helcim's documentation describes no test-event button, so test with a real payment in your account, or run a local tunnel:

```bash
# Express / Next.js (use 8000 for FastAPI)
npx hookdeck-cli listen 3000 helcim --path /webhooks/helcim
```

Use the printed URL as the Deliver URL, then process a test transaction and watch the request arrive. Check each delivery's `webhook-signature` against the example in [verification.md](verification.md).

## What Does a cardTransaction Not Tell Me?

Only the transaction `id`. Call [Get Card Transaction by ID](https://devdocs.helcim.com/reference/getcardtransaction) with it to get the amount, card type and the rest, then complete your checkout flow.

## IP Allowlists

Helcim documents no fixed source IPs. Verify `webhook-signature` rather than allowlisting.
