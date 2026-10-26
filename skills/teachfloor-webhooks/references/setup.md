# Setting Up Teachfloor Webhooks

## Prerequisites

- A Teachfloor account with access to **Developers**
- A public HTTPS URL for your endpoint (use the Hookdeck CLI while developing)

## Register Your Endpoint

1. In Teachfloor, open **Developers > Webhooks**.
2. Add an endpoint and enter your URL.
3. Choose the events to receive. Recommended starting set: `course.join`, `course.completed`,
   `element.completed`, `member.login`. The full list is in [overview.md](overview.md).
4. Save the endpoint.

## Get Your Signing Secret

Each endpoint has its own signing secret. Open the endpoint and use **Reveal Signing Secret**,
then copy it into `TEACHFLOOR_WEBHOOK_SECRET`. Teachfloor signs every request with it and puts
the result in the `teachfloor-signature` header. Use the secret as-is, as a UTF-8 string.

## Respond Quickly

Return a `2xx` within 10 seconds. Teachfloor makes 3 attempts in total (10 seconds, then 100
seconds between attempts). Do slow work asynchronously after responding.

## Hookdeck Setup

When you use a Teachfloor source in Hookdeck, paste the endpoint's signing secret into the
source's verification settings. Hookdeck's source verifies the signature and forwards the
request to your destination. Put the Hookdeck source URL in the Teachfloor endpoint.

## Local Development

```bash
npx hookdeck-cli listen 3000 teachfloor --path /webhooks/teachfloor
```

Use the printed URL as the endpoint URL.

## Testing

Trigger a real event in a test course (for example join a course or complete an element) and
watch the delivery arrive. Use a separate endpoint, and therefore a separate signing secret,
for development and production.
