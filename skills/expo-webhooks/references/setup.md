# Setting Up Expo (EAS) Webhooks

## Prerequisites

- An Expo account with an EAS project
- [EAS CLI](https://docs.expo.dev/eas/) installed and logged in (`eas login`)
- A public HTTPS URL that accepts POST requests, e.g. `https://your-app.com/webhooks/expo`

## How Do I Choose a Signing Secret?

Expo does not generate one; you choose it. It must be **at least 16 characters**:

```bash
openssl rand -hex 32
```

Store the same value in your app as `EXPO_WEBHOOK_SECRET`.

## How Do I Register My Endpoint?

Webhooks are configured **per project**. Run this from each project directory:

```bash
eas webhook:create
```

The CLI prompts for the event type, URL, and secret. Or pass them as flags:

```bash
eas webhook:create --event BUILD --url https://your-app.com/webhooks/expo --secret "$EXPO_WEBHOOK_SECRET"
eas webhook:create --event SUBMIT --url https://your-app.com/webhooks/expo --secret "$EXPO_WEBHOOK_SECRET"
```

Create one webhook per event type. They can share a URL, since payloads differ by field.

## How Do I Manage Webhooks?

```bash
eas webhook:list                     # find the webhook ID
eas webhook:update --id WEBHOOK_ID   # change the URL and/or secret
eas webhook:delete                   # choose a webhook to remove
```

## How Do I Test Locally?

```bash
npx hookdeck-cli listen 3000 expo --path /webhooks/expo
```

Use the printed Hookdeck URL as the webhook `--url`, then run a build (`eas build`) or submission (`eas submit`). The Next.js example also runs on port 3000; for FastAPI use `npx hookdeck-cli listen 8000 expo --path /webhooks/expo`.

## Notes

- There is no separate test mode; trigger a real build or submission.
- Respond with a 2xx status; anything outside 200-399 is retried with exponential back-off.
