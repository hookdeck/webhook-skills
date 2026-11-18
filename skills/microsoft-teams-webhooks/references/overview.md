# Microsoft Teams Outgoing Webhooks Overview

## What Are Outgoing Webhooks?

An outgoing webhook lets a Teams channel talk to your service without building a full Bot Framework bot. You add it to a team with a name, and users invoke it by **@mentioning** that name in a channel. Teams sends the message to your callback URL, and your response appears in the same reply chain.

| Feature | What Microsoft documents |
|---------|--------------------------|
| Scope | Team level. Each team needs its own outgoing webhook. Visible to all team members. |
| Trigger | Reactive only: users must **@mention** the webhook. Only in **public channels**, not personal or private scope. |
| Request | HTTP `POST` with a JSON Bot Framework activity, signed with `Authorization: HMAC <base64>`. |
| Response | Appears in the same chain as the original message. Can carry Bot Framework message content: text, images, cards. Cards support only the `openURL` action. |
| Timeout | Your code gets **5 seconds** to respond before the connection times out. |
| API access | None. Outgoing webhooks can't call other Teams APIs (roster, channel list, ...). |

Use them for slash-command-style helpers ("@Helper status", "@Helper ticket 123"), lookups and simple notifications back into the thread.

## The Request

Teams sends a Bot Framework `message` activity ("a standard Azure bot service messaging schema"). Microsoft's page shows no full sample, so treat this as **illustrative**:

```json
{
  "type": "message",
  "id": "1731924900123",
  "timestamp": "2026-11-18T10:15:00.123Z",
  "localTimestamp": "2026-11-18T11:15:00.123+01:00",
  "serviceUrl": "https://smba.trafficmanager.net/emea/",
  "channelId": "msteams",
  "from": { "id": "29:1Xh...", "name": "Megan Bowen", "aadObjectId": "6d4b..." },
  "conversation": {
    "isGroup": true,
    "conversationType": "channel",
    "id": "19:...@thread.tacv2;messageid=1731924900123",
    "tenantId": "72f9..."
  },
  "textFormat": "plain",
  "text": "<at>Helper</at> status",
  "attachments": [{ "contentType": "text/html", "content": "<div><at>Helper</at> status</div>" }],
  "entities": [{ "type": "clientInfo", "locale": "en-US" }],
  "channelData": {
    "teamsTeamId": "19:...@thread.tacv2",
    "teamsChannelId": "19:...@thread.tacv2",
    "tenant": { "id": "72f9..." }
  }
}
```

Fields handlers typically use:

| Field | Use |
|-------|-----|
| `text` | The message, with the mention as `<at>Name</at>`. Strip it (and any HTML) to get the command. |
| `from.name`, `from.aadObjectId` | Who sent it |
| `conversation.id`, `channelData.teamsChannelId` | Where it was sent |
| `id` | The message ID: log it, or dedupe on it |

Log one real request (headers and body) before relying on any other field.

## The Response

Return JSON. A text reply:

```json
{ "type": "message", "text": "This is a reply!" }
```

An Adaptive Card reply (from Microsoft's examples):

```json
{
  "type": "message",
  "attachments": [
    {
      "contentType": "application/vnd.microsoft.card.adaptive",
      "content": {
        "type": "AdaptiveCard",
        "version": "1.4",
        "body": [{ "type": "TextBlock", "text": "Request sent by: Megan" }]
      }
    }
  ]
}
```

Hero cards (`application/vnd.microsoft.card.hero`) work too. Only `openURL` actions are supported on cards.

## Behind Hookdeck

Teams waits for the response and posts it. Hookdeck accepts the request and replies to Teams itself, before your destination runs, so your handler's reply is never posted. Set a custom response on the Hookdeck source (content type JSON, body like `{"type":"message","text":"Received"}`). Use Hookdeck when you want queueing, retries and replay for the processing, and post any result back through another route.

## Full Reference

- [Create Outgoing Webhooks](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-outgoing-webhook) ([raw markdown](https://github.com/MicrosoftDocs/msteams-docs/blob/main/msteams-platform/webhooks-and-connectors/how-to/add-outgoing-webhook.md), which keeps the tabbed sections)
- [Microsoft's outgoing webhook samples](https://github.com/OfficeDev/Microsoft-Teams-Samples/tree/main/samples/TeamsSDK/Archived/outgoing-webhook) (C# and Node.js)
