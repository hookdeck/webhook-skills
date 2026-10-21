# Setting Up Tailscale Webhooks

## Prerequisites

- A tailnet where you are an Owner, Admin, Network admin, or IT admin
- A public HTTPS endpoint on port 80 or 443 (e.g. `https://your-app.com/webhooks/tailscale`)

## Create the Endpoint and Get Your Webhook Secret

1. Open the **Webhooks** page of the Tailscale admin console.
2. Select **Add endpoint**.
3. Enter the **Webhook URL**. Leave **Destination** as *None* to get the general Tailscale JSON
   format (other choices reformat events for Discord, Google Chat, Mattermost, or Slack, which
   changes the body shape and is not what these examples parse).
4. Select event categories or specific events (e.g. `nodeCreated`, `nodeNeedsApproval`,
   `nodeApproved`, `nodeKeyExpiringInOneDay`, `nodeDeleted`, `policyUpdate`, `userCreated`).
   Selecting a category auto-subscribes you to events Tailscale adds to it later.
5. Select **Add endpoint**. In the **Webhook secret** popup, **copy the secret now**: it looks
   like `tskey-webhook-xxxxx`, is case-sensitive, and can't be shown again.
6. Store it as `TAILSCALE_WEBHOOK_SECRET`.

If the secret leaks, create a new one from the endpoint's menu, then update your app. It has no expiry.

## Test Your Endpoint

On the Webhooks page, open the endpoint's menu, choose **Test endpoint**, then **Send test event**.
Within seconds your endpoint receives an event with `type: "test"`.

## Local Development

```bash
npx hookdeck-cli listen 3000 tailscale --path /webhooks/tailscale
```

Use the tunnel URL as the Webhook URL (it is HTTPS). For FastAPI use port `8000`.

## Updating, Rotating, Deleting

Edit the endpoint to change subscribed events, rotate the secret, or delete it. Changes are
recorded in configuration audit logs. Add new events by editing the existing endpoint.
