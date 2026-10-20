# LINE Webhooks Overview

## What Are LINE Webhooks?

The LINE Messaging API sends an HTTPS `POST` to your bot server's webhook URL whenever something happens to your LINE Official Account: a user sends a message, adds the account as a friend, taps a postback button, joins a group, and so on.

Each request is JSON with two top-level fields:

- `destination`: the user ID of the bot that should receive the events (`U` + 32 hex chars)
- `events`: an array of webhook event objects. **It can be empty**: the console's **Verify** button sends `{"destination":"U...","events":[]}` to check that your endpoint is reachable, and you must answer `200`.

Every request is signed. The `x-line-signature` header carries `base64(HMAC-SHA256(channel secret, raw body))`. See [verification.md](verification.md).

## Common Event Types

The `type` field of each event object. These strings are case-sensitive and use camelCase (`memberJoined`, not `member_joined`).

| Event `type` | Triggered When | Common Use Cases |
|--------------|----------------|------------------|
| `message` | A user sends a message (`message.type`: `text`, `image`, `video`, `audio`, `file`, `location`, `sticker`) | Chatbot replies, saving content, routing to support |
| `messageEdited` | A user edits a text message (currently group chats only) | Updating stored message text |
| `unsend` | A user unsends a message | Deleting the stored message |
| `follow` | A user adds the account as a friend or unblocks it (`follow.isUnblocked`) | Welcome message, creating the user record |
| `unfollow` | A user blocks the account | Stop messaging, mark the user inactive |
| `join` | The account joins a group chat or multi-person chat | Greeting the group |
| `leave` | The account is removed from, or leaves, a group or multi-person chat | Cleaning up group state |
| `memberJoined` | A user joins a group or multi-person chat the account is in | Greeting new members |
| `memberLeft` | A user leaves a group or multi-person chat the account is in | Updating membership lists |
| `postback` | A user triggers a postback action (`postback.data`, optional `postback.params`) | Button and rich-menu handling, date/time pickers |
| `videoPlayComplete` | A user finishes a video message that had a `trackingId` | Engagement tracking |
| `beacon` | A user enters the range of a LINE Beacon | Location-based messaging |
| `accountLink` | A user links their LINE account to your service (`link.result`, `link.nonce`) | Completing account linking |
| `membership` | A user joins, leaves, or renews a membership (`membership.type`: `joined`, `left`, `renewed`) | Paid-membership features |

Less common types: `module`, `activated`, `deactivated` (module channels), `botSuspended`, `botResumed`, and `delivery` (LINE notification messages). Handle them with a default branch.

## Event Payload Structure

```json
{
  "destination": "U8e742f61d673b39c7fff3cecb7536ef0",
  "events": [
    {
      "type": "message",
      "message": {
        "type": "text",
        "id": "468789577898262530",
        "quoteToken": "q3Plxr4AgKd...",
        "text": "Chicken, please."
      },
      "webhookEventId": "01H810YECXQQZ37VAXPF6H9E6T",
      "deliveryContext": { "isRedelivery": false },
      "timestamp": 1692251666727,
      "source": { "type": "group", "groupId": "Ca56f94637c...", "userId": "U4af4980629..." },
      "replyToken": "38ef843bde154d9b91c21320ffd17a0f",
      "mode": "active"
    }
  ]
}
```

Fields shared by every event:

| Field | Description |
|-------|-------------|
| `type` | Event type (table above) |
| `timestamp` | When the event happened, in **milliseconds** |
| `mode` | `active` or `standby` (another channel is handling the chat; don't reply) |
| `webhookEventId` | ULID that uniquely identifies the event. Use it for deduplication. |
| `deliveryContext.isRedelivery` | `true` if this is a redelivery of a failed webhook |
| `source` | `{type: "user", userId}`, `{type: "group", groupId, userId?}` or `{type: "room", roomId, userId?}` |
| `replyToken` | Present on events you can reply to. Pass it to the reply message endpoint. |

## Delivery Behavior

- **Batching**: one request can carry several events. Loop over `events`.
- **Redelivery**: disabled by default. When you enable **Webhook redelivery** on the Messaging API tab, LINE retries requests that don't get a 2xx response. LINE doesn't disclose the retry count or interval. Redelivered events keep the same `webhookEventId` and `replyToken`.
- **Ordering**: not guaranteed, especially with redelivery. Sort by `timestamp` if order matters.
- **Respond quickly**: LINE recommends processing events asynchronously so one slow request doesn't hold up the next.
- **No published IP ranges**: LINE doesn't publish the IP addresses that send webhooks. Verify the signature instead of allowlisting IPs.

## Full Event Reference

- [Receive messages (webhook)](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
- [Webhook event objects (Messaging API reference)](https://developers.line.biz/en/reference/messaging-api/#webhook-event-objects)
