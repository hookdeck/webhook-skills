# Setting Up PubNub Webhooks

## Prerequisites

- A PubNub account with access to the Admin Portal and a keyset
- An HTTPS endpoint (use `npx hookdeck-cli listen 3000 pubnub --path /webhooks/pubnub` while developing)

## How Do I Create the Webhook Action?

1. In the Admin Portal, open **Events & Actions** and click **+ Add Action**.
2. Click **Webhook**.
3. Enter your endpoint's HTTPS URL under **Configuration**, for example
   `https://your-domain.com/webhooks/pubnub`.
4. Add authentication (below).
5. Leave **Batching** off unless you need it, and turn **Is Enveloped** off so the body uses the
   No Envelope layout this skill parses.
6. Optionally turn on **Webhook retry** and set the retry count and interval (paid tiers).
7. Click **Add event listener** and pick an existing listener, or create one that watches the
   source you need (Messages, Users, Channels, Mobile Push Notifications, Memberships) with a filter.
8. Click **Save changes**.

## How Do I Add the Secret Header?

PubNub doesn't sign requests. In the action's configuration, add a **custom header** and select a
**secret key** from your keyset as its value, so the secret isn't stored in plain text.

1. Choose a header name, for example `Authorization` or `X-PubNub-Secret`.
2. Select the secret as the value. If you want a prefix such as `Bearer `, include it in the
   value you configure.
3. Set `PUBNUB_WEBHOOK_HEADER` to the header name and `PUBNUB_WEBHOOK_SECRET` to the **exact
   whole value** PubNub will send, prefix included.

## Test Mode vs Live Mode

There is no separate test mode. Publish a message (or trigger whichever event you configured)
that matches the listener's filter and check that your endpoint receives a request. If nothing
arrives, confirm the action is paired with a listener whose filter matches the event and that the
URL accepts HTTPS requests from PubNub. The Free tier's single listener doesn't retry failures.
