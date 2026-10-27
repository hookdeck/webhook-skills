# Setting Up iDenfy Webhooks

## Prerequisites

- An iDenfy account with access to dashboard settings
- A public HTTPS endpoint (a Hookdeck URL works; see below)

## How Do I Get the Signing Key?

**Hookdeck setup:** Set a signing key on the iDenfy webhook. Without one, deliveries are unsigned and fail verification.

iDenfy does not generate the key. You choose a secret and enter it:

1. In the iDenfy dashboard go to **Settings → System notifications**.
2. Click the webhook you want to protect to expand it.
3. Open the **Headers** section and set the **Signing key** field.
4. Put the same value in `IDENFY_WEBHOOK_SECRET`.

Each event type's webhook can have its own signing key. A verifier checks one key, so use the
same key on every webhook that points at the same endpoint (or one endpoint per key).
Copy the key exactly: trailing whitespace breaks verification.

## Register Your Endpoint

1. In **Settings → System notifications**, open the webhook for the event type you want.
2. Enter your HTTPS URL, e.g. `https://example.com/webhooks/idenfy`.
3. Enable the events you need: `ID VERIFICATION AUTO FINISHED`, `ID VERIFICATION MANUAL
   FINISHED`, `COMPANY REVIEW` and `AML MONITORING` are the usual starting set.
4. Save, then create a sample result from the dashboard sandbox to see a delivery.

## Local Development

```bash
npx hookdeck-cli listen 3000 idenfy --path /webhooks/idenfy
```

Use the URL it prints as the webhook URL. For FastAPI use port `8000`.

## Test Mode vs Live Mode

iDenfy provides a sandbox and dummy results for testing. Webhook signing works the same way
in both; set the signing key on the webhook in each environment. Optionally restrict inbound
traffic to iDenfy's published IP ranges as defense in depth (see iDenfy's IP whitelisting page).
