# Setting Up Outseta Webhooks

## Prerequisites

- An Outseta account with access to Settings > Notifications
- An HTTPS endpoint (use the Hookdeck CLI locally)

## 1. Generate the Key

The key must be 32 bytes, written as hex (64 characters):

```bash
openssl rand -hex 32
```

Store it in `OUTSETA_WEBHOOK_SIGNATURE_KEY`.

## 2. Add the Key in Outseta

Open **Settings > Notifications > ⚙️** and add the same key. From then on Outseta adds an `x-hub-signature-256` header to all notification requests.

## 3. Add a Notification

Under **Settings > Notifications**, add a notification for an activity (for example Person Login) with your callback URL, such as `https://your-app.example.com/webhooks/outseta`.

## Test

Outseta's suggested check:

1. Log in to your site (Person Login) and confirm the call passes validation.
2. Change the key in your code **or** in Outseta (not both), log out and in again, and confirm the call fails.
3. Restore the original key.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 outseta --path /webhooks/outseta
```

Use the printed URL as the notification's callback URL.

## Using Hookdeck

Create a source with the **Outseta** source type and paste the same 64-character hex key you added in Outseta. Hookdeck hex-decodes it and verifies `x-hub-signature-256`. Verification is optional on the source, and Hookdeck applies no timestamp window. Update the source whenever you change the key in Outseta.
