# Setting Up Circleback Webhooks

## Prerequisites

- A Circleback account with access to Automations
- A publicly reachable HTTPS endpoint, e.g. `https://example.com/webhooks/circleback`.
  For local development, use the Hookdeck CLI:

  ```bash
  npx hookdeck-cli listen 3000 circleback --path /webhooks/circleback
  ```

## Create the Webhook Automation

1. Open **Automations** in Circleback and select **New automation**.
2. Add automation conditions to limit which meetings it runs for, then select **Next**.
3. Select **Send webhook request**.
4. Enter your endpoint URL and choose the meeting outcomes to include (notes, action items, transcript, insights).
5. Copy the **signing secret** shown for the webhook and store it as `CIRCLEBACK_SIGNING_SECRET`.
6. Optionally send a test request for your most recent meeting.
7. Select **Done**, name the automation, and select **Save**.

Every meeting matching the conditions is now sent to your endpoint.

## Export Past Meetings

Select meetings in the meeting list (or select all), then choose the automation
from the **Actions** menu to send them through the webhook.

## Signing Secret

The secret is generated when you configure the webhook step and is unique to it.
Signature verification is optional on Circleback's side, but the examples
require the secret and reject unsigned requests.

## Testing

Use the test request in the webhook step, or the Hookdeck CLI above to inspect
real deliveries.
