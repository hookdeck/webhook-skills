# Setting Up a Microsoft Teams Outgoing Webhook

## Prerequisites

- A team where you can manage apps (team owner, or as your tenant's policy allows).
- A public **HTTPS** callback URL that accepts JSON `POST`s.

## 1. Create the Outgoing Webhook

1. Select **Teams** in the left pane.
2. Next to the team, select **•••** and then **Manage team**.
3. Select **Apps**.
4. Under **Upload an app**, select **Create an outgoing webhook**.
5. Fill in:
   - **Name**: the webhook's title and the name users **@mention**.
   - **Callback URL**: your HTTPS endpoint, e.g. `https://example.com/webhooks/microsoft-teams`.
   - **Description**: shown in the profile card and the team's app list.
   - **Profile picture** (optional).
6. Select **Create**.

## 2. Save the Security Token

After you select Create, Teams shows an **HMAC security token**. It doesn't expire and is unique to this webhook. Copy it into your app's environment:

```bash
MICROSOFT_TEAMS_SECURITY_TOKEN=zN0uIOo7AK9myNAQMhZ8PZNO2UZb9PXmx0V7r26UcOc=   # example format only
```

The token is base64. Your handler decodes it to bytes and uses those bytes as the HMAC key (see [verification.md](verification.md)).

**Hookdeck:** on a Microsoft Teams source (`MICROSOFT_TEAMS`), paste the token as Teams shows it. Verification is optional on the source. Then set a **custom response** on the source with content type JSON and a body such as:

```json
{ "type": "message", "text": "Received" }
```

Hookdeck answers Teams before your destination runs, so without a custom response the channel gets Hookdeck's default response, which isn't a Teams message, and your destination's reply is never shown.

## 3. Test

In a **public channel** of the team, post a message that @mentions the webhook by name, e.g. `@Helper status`. Without an @mention, or in a private channel, chat or personal scope, nothing is sent.

To inspect requests while you develop:

```bash
npx hookdeck-cli listen 3000 microsoft-teams --path /webhooks/microsoft-teams
```

The CLI shows each request and your handler's response. The reply that appears in Teams comes from Hookdeck, though, so to test your handler's own replies in Teams, expose your local server directly over HTTPS (any tunnel that forwards the response).

## 4. Respond in Time

Teams gives your service about 5 seconds. Verify, build a short reply, and return. Push slow work to a queue and reply with an acknowledgement.

## Changing the URL or Token

The docs don't describe editing an outgoing webhook's URL or rotating its token. If the token leaks, remove the webhook from the team's apps and create a new one, which gets a new token, then update `MICROSOFT_TEAMS_SECURITY_TOKEN` (and the Hookdeck source).
