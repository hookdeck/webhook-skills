# Setting Up Amplitude Webhooks

## Prerequisites

- An Amplitude organization on the Plus, Growth or Enterprise plan
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 amplitude --path /webhooks/amplitude` for local work)

## Create the Sync

1. In Amplitude Data, click **Catalog** and open the **Destinations** tab.
2. Search for "Webhook" and select **Webhook: Events · User Properties**.
3. Enter a sync name and click **Create Sync**.

## Set the URL

Enter your endpoint URL, for example `https://mycompany.com/webhooks/amplitude`. Amplitude has no
single IP address for forwarding, so the endpoint must accept requests from any Amplitude host.

## Add the Secret Header

`Content-Type` and `User-Agent` are preset. Below them you can define up to five more headers:

1. Enter a header name in the left box, for example `Authorization` or `X-Amplitude-Secret`.
2. Enter a long random secret in the right box. Type the whole value you want sent, including a
   `Bearer ` prefix if you want one.
3. Store the same name and value in your environment:

   ```bash
   AMPLITUDE_WEBHOOK_HEADER=X-Amplitude-Secret
   AMPLITUDE_WEBHOOK_SECRET=<the exact value you typed>
   ```

## Choose What to Send

- **Send Events:** enable the toggle, pick the default payload or a FreeMarker template, and use
  **Select and filter events** to choose events. Send only what you need.
- **Send Users:** enable the toggle and pick the default or a template. Users are sent when
  Amplitude receives an event and for Identify API calls.

## Enable

Set **Status** to Enabled at the top of the page and click **Save**.

## Test

Trigger an event that matches your filter and check your endpoint logs. A `401` means the header
name or value doesn't match what your endpoint expects (see
[verification.md](verification.md#how-do-i-debug-401-responses)).

## Rotating the Secret

Change the header value in the destination and `AMPLITUDE_WEBHOOK_SECRET` together. Requests
still in Amplitude's retry window (up to 4 hours) carry whichever value was current when they
were attempted, so expect a few `401`s during the switch, or briefly accept both values.
