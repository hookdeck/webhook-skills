# Setting Up Absorb LMS Webhooks

## Prerequisites

- An Absorb LMS portal where you are a **System Administrator** (only they can configure webhooks)
- A public HTTPS listener URL (use the Hookdeck CLI while developing)
- A sandbox portal for testing. Absorb advises against testing in production

## Register Your Endpoint

1. Open the **Admin Experience**.
2. From the Admin Interface, open the **Account** menu (top right) and click **Client Settings**.
3. Click **New Webhook** and fill in the form:
   - **Name**: internal, for recordkeeping
   - **Events**: pick one or more events from the drop-down
   - **URL**: your listener URL
4. Click **Save**.

If one listener should receive several events, create **one** webhook with several events
rather than one webhook per event. A saved webhook appears in the list and can be edited or
removed; set **Enable Webhook** to Off to pause it.

## Get Your Secret Key

The **Secret Key** field is empty until the webhook has been saved. After saving, reopen the
webhook and copy the key into `ABSORB_WEBHOOK_SECRET`. Absorb signs each request with it and
puts the result in the `absorb-signature` header.

## Test Mode vs Live Mode

Before saving, the **Test Webhook** button sends a test request to your URL and shows the
response from your listener. **Test requests carry a randomly generated signature, not one made
with your Secret Key, so they cannot be verified.** Your handler should reject them with `401`,
and that is a correct result.

**Hookdeck setup:** Absorb's Test Webhook button sends a random signature, so test events fail
verification in an Absorb LMS source too. Real deliveries are signed with the Secret Key. To
confirm the whole path, save the webhook with the Hookdeck source URL, copy the Secret Key into
the source's verification settings, then trigger a real event (for example create a user in a
sandbox portal) and watch it arrive in the Hookdeck request view.

## Go Live

Recreate the webhook in the production portal (same steps) and save it. The listener URL may
match the sandbox one or differ. Production fires events more often, so make sure the listener
is ready first. Each webhook has its own Secret Key, so the production webhook has a different
`ABSORB_WEBHOOK_SECRET` from the sandbox one.

## Local Development

```bash
npx hookdeck-cli listen 3000 absorb-lms --path /webhooks/absorb-lms
```

Use the printed URL as the webhook's **URL**.
