# Live Tennis API Webhooks Overview

## What Are Live Tennis API Webhooks?

Live Tennis API can push live tennis data to an HTTPS endpoint you register with `POST /webhooks`, instead of you polling. Each delivery is one POST containing the same frame the WebSocket feed sends. Webhooks need the **ULTRA** plan and a **direct** API key (not a marketplace key), and you can register up to 3 per key (`409 webhook_limit` beyond that).

## Common Event Types

The `X-LTAPI-Event` header carries the frame type, and the JSON body normally repeats it in `type`. The examples dispatch on the signed body `type` and fall back to the header.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `score` | Every accepted live-score commit | Live scoreboards, on-air graphics |
| `point` | A point is played (needs point-by-point coverage on the match) | Point-by-point tracking, analytics |
| `break_point` | A break point arises | Alerts, in-play models |
| `break_point_result` | A break point resolves | Alerts, settling `held` / `broken` outcomes |

Which frames you receive is chosen at registration via the `events` array in the `POST /webhooks` body (`score` is the default; `break_point` covers both break point frames; `point` is one POST per live point).

## Event Payload Structure

All frames are JSON objects with `type` and `match_id`.

- `score`: the complete current score: `sets`, `games`, `points`, `server`, `is_tiebreak`, `sequence`, `timestamp`, and for ULTRA `win_probability_p1` and `danger`. Order and dedupe on `sequence`.
- `point`: `{ type, match_id, point: { seq, set, game, number, tiebreak, server, winner, score, sets, games, ts }, pbp_coverage, quality }`. `point.seq` is per-match, monotonic and never skips, so dedupe on it.
- `break_point`: `server`, `returner`, `break_points` (1-3 live at once), `set`, `game`, `point`, `win_probability_p1`, `prob_swing`, `ts`.
- `break_point_result`: `server`, `outcome` (`held` or `broken`), `win_probability_p1_after`, `ts`.

Player numbers are `1` or `2`.

## Delivery Semantics

- **At-most-once, no replay.** One attempt per frame, ~3 second timeout, redirects disabled. Respond 2xx quickly and do slow work asynchronously.
- A missed `score` self-corrects on the next commit because each one is the full current score.
- A missed `point` does **not** self-correct. Recover with `GET /matches/{matchId}/points?after_seq=` and dedupe by `seq`.
- After **25 consecutive failures** the webhook is disabled (`enabled: false`, `last_error` set in `GET /webhooks`). Delete it and register again to resume.

## Full Event Reference

For the complete reference, see [Live Tennis API's webhook documentation](https://docs.livetennisapi.com/push-feed-and-webhooks.html) and the [API reference](https://docs.livetennisapi.com/reference.html).
