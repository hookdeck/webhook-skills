# Setting Up Slack Webhooks

## Prerequisites

- A Slack workspace where you have permission to install apps
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI or ngrok for local dev)

## 1. Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** → **From scratch**.
2. Name the app and pick the workspace to install it in.

## 2. Get Your Signing Secret

The signing secret is used to verify that incoming requests really come from Slack.

1. In your app, go to **Settings → Basic Information**.
2. Scroll to **App Credentials**.
3. Copy the value of **Signing Secret** (click *Show* to reveal it).
4. Set it as `SLACK_SIGNING_SECRET` in your environment.

> Treat this like a password. Never commit it; never log it.

## 3. Enable Event Subscriptions

1. In your app, go to **Features → Event Subscriptions**.
2. Toggle **Enable Events** to **On**.
3. In **Request URL**, enter the public URL of your webhook endpoint, e.g.
   `https://your-domain.com/webhooks/slack`.
4. Slack sends a one-time `url_verification` request to that URL. Your
   handler must verify the signature and echo back the `challenge` field as
   JSON: `{ "challenge": "<value>" }`. Once Slack receives this, the URL
   shows **Verified ✓**.

## 4. Subscribe to Events

Under **Subscribe to bot events**, click **Add Bot User Event** and pick the
events you want. Common starting set:

- `app_mention` — required for most chat-bot patterns
- `message.channels` — messages in public channels the bot is in
- `reaction_added` — emoji reactions
- `team_join` — onboarding workflows
- `app_home_opened` — render the App Home view

Save changes. Slack will prompt you to **reinstall the app** so the new scopes
take effect.

## 5. Install the App to a Workspace

1. Go to **Settings → Install App**.
2. Click **Install to Workspace** and approve the OAuth scopes.
3. Invite the bot user to any channel where you want to receive `message` or
   `app_mention` events.

## 6. Test the Endpoint

Trigger a real event:

- @mention the app in a channel → triggers `app_mention`
- React to a message with an emoji → triggers `reaction_added`
- Open the app's Home tab in Slack → triggers `app_home_opened`

Check the **Event Subscriptions → Recent Deliveries** panel (if shown) and your
server logs.

## Local Development

Use the Hookdeck CLI to forward Slack events to a local server — no account or
ngrok tunnel required:

```bash
npx hookdeck-cli listen 3000 slack --path /webhooks/slack
```

Paste the URL Hookdeck prints into the **Request URL** field in your Slack App.
