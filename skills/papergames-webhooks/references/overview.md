# Papergames Webhooks Overview

## What Are Papergames Webhooks?

[Papergames](https://papergames.io) is an online multiplayer board-game platform (Battleship, Tic Tac Toe, Connect 4, Gomoku, Chess) with an embeddable games API. You create a game session over the REST API (`POST /api/v2/game-session/player-vs-player`, authenticated with your `X-Api-Key`), embed the returned `playUrl` / `watchUrl` in an iframe, and Papergames sends webhooks as games in that session start and finish. You can use them to sync scores back into your own system.

Webhooks are sent over HTTPS as `POST` requests with a JSON body, delivered by [Svix](https://www.svix.com). Each request is signed with the `svix-id`, `svix-timestamp` and `svix-signature` headers (see [verification.md](verification.md)).

## What Events Does Papergames Send?

The events page documents exactly two event types:

| Event (`eventType`) | Triggered When | Common Use Cases |
|---------------------|----------------|------------------|
| `game.started` | A game within a game session starts. Can fire several times per session | Mark the match as live, notify spectators, start a timer |
| `game.finished` | A game within a game session finishes. Can fire several times per session | Record the result, update leaderboards, award prizes |

Each endpoint subscribes to a chosen subset of events when you create it. Papergames invites customers to ask for new event types, so the list may grow: acknowledge (`2xx`) any `eventType` you don't handle.

**Operational notification:** the retry-schedule page says that once every delivery attempt for a message has failed, "you will get a webhook of type `message.attempt.exhausted`". That is Svix's operational event, not a `game.*` event. Papergames doesn't document its payload or say whether it arrives on the same endpoint, so the examples treat it like any other unrecognised type.

## What Does the Payload Look Like?

The body is Papergames' own camelCase envelope, **not** the Standard Webhooks `type` / `data` shape. Route on `eventType`; the game session is in `payload`:

```json
{
  "eventType": "game.started",
  "payload": {
    "createdAt": "2023-11-03T10:34:28.191Z",
    "gamesPlayed": 0,
    "players": [
      { "externalId": "PEP_001", "name": "Pepito", "score": 0 },
      { "externalId": "JD_001", "name": "John Doe", "score": 0 }
    ],
    "status": "playing",
    "uid": "8qgmUmqJj",
    "updatedAt": "2023-11-03T10:34:35.508Z"
  }
}
```

The documented `game.finished` example is identical except `gamesPlayed` is `1`, Pepito's `score` is `1`, and `updatedAt` is `2023-11-03T10:34:57.484Z`.

There is no event-type header, so you have to parse the body (after verifying the signature) to route.

### Fields (as seen in the documented samples)

Papergames publishes example payloads, not a formal schema. From those samples:

| Field | Meaning |
|-------|---------|
| `uid` | Game session ID, as returned when you created the session. Use it to find your own record |
| `gamesPlayed` | Number of completed games in the session |
| `players[].name` | Display name (the `username` you put on the iframe URL) |
| `players[].score` | Player's score in the session |
| `players[].externalId` | **Your** user ID. Only present if you passed `externalUserId` on the iframe URL, so treat it as optional and fall back to `uid` + `name` |
| `status` | `"playing"` is the only documented value |
| `createdAt` / `updatedAt` | ISO-8601 UTC timestamps |

To get `externalId` into the payload, pass it on the iframe URL:

```
https://papergames.io/en/r/{uid}/embed/play?username=John%20Doe&externalUserId=JD_001
```

### Gotchas

- **`status` does not mean the session is over.** It's still `"playing"` in the documented `game.finished` example, because a session can contain several games. Use the event type.
- **There's no `winner` field.** On `game.finished`, compare `score` across `players[]` (and allow for ties).
- **`webhookPayload` wrapper.** The events page's prose gives the path as `webhookPayload.payload.players[].externalId`, but every JSON example starts at `eventType` / `payload` with no wrapper. The examples treat the JSON samples as correct, and also accept the envelope one level down under `webhookPayload` in case the prose describes the real shape.
- **Repeated events.** Both events fire once per game, so one session produces several `game.started` / `game.finished` pairs. Store state per `uid` + `gamesPlayed`, not per `uid` alone.

## How Is Delivery Retried?

Return `2xx` quickly and do slow work asynchronously. A failed attempt is retried with exponential backoff, each period starting after the previous attempt fails: immediately, 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours, 10 hours. In the docs' example, a message that fails three times and then succeeds arrives about 35 minutes and 5 seconds after the first attempt.

- After the last attempt the message is marked **Failed** for that endpoint, and a `message.attempt.exhausted` webhook is sent (see the caveat above).
- If every attempt to an endpoint fails for 5 days, the endpoint is disabled.
- Disabling or deleting an endpoint stops delivery to it.
- `svix-id` stays the same when a message is resent, so deduplicate on it.
- Delivery is at-least-once and, as with Svix generally, order isn't guaranteed. Key state on `uid` + `gamesPlayed` instead of relying on arrival order. (This is a general Svix property, not a guarantee Papergames publishes.)

## Full Event Reference

- [Events](https://developers.papergames.io/docs/webhooks/events)
- [Webhooks introduction](https://developers.papergames.io/docs/webhooks/)
- [Retry schedule](https://developers.papergames.io/docs/webhooks/retry-schedule)
