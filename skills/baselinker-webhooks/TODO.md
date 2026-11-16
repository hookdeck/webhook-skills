# TODO - Known Issues and Improvements

*Last updated: 2026-08-14*

These items were identified while authoring the skill. They are acceptable for
merge; contributions to close them are welcome.

## What is confirmed

- [x] **BaseLinker publishes no webhook documentation.** Verified by extracting
  every method name from `api.baselinker.com` (~195 methods, all request/response
  over `connector.php`, none webhook-related) and crawling the whole Help Centre
  in both English (342 articles) and Polish (355) for "webhook" — zero hits. Zapier
  and Make both integrate by pasting an API token and polling, not by registering a
  callback URL.
- [x] **The transport is HTTP HEAD with the payload in the query string.**
- [x] **There is no authentication of any kind.** Hookdeck's
  `SourceConfigBaselinkerAuth` is `{properties: {}, additionalProperties: false}`
  — it accepts no secret, unlike every HMAC source in the same spec (which carry
  `webhook_secret_key`). BaseLinker sits with AWS SNS, Microsoft Graph, Microsoft
  SharePoint, Monday, Strava, Tikkie, Ethoca and Zift in the zero-property-auth
  cohort.
- [x] **No handshake/challenge step.** Unlike Trello (which uses HEAD as a
  verification probe), a Baselinker HEAD request is an ordinary delivery.
- [x] **HEAD must be allowed on the Hookdeck source** ([custom methods](https://hookdeck.com/docs/sources#custom-methods)).

## Still open (deliberately hedged in the docs)

- [ ] **The full query-param list is unknown.** Only `order_id` (e.g. `42`) and
  `state` (e.g. `packed`) have been observed. They are presented throughout as
  *observed examples*, never as a documented or exhaustive list. If more params
  are observed in the wild, add them — with the same hedge.
- [ ] **The `state` value space is unknown.** It is treated as an opaque string,
  not an enum and not an event-type discriminator. No `switch` over state values
  appears anywhere in the skill, by design.
- [ ] **No BaseLinker account was available**, so nothing in the panel was ever
  inspected. Every "there is no X" claim in this skill is scoped to the
  *documentation*, which was searched exhaustively in both locales. Claims about
  panel contents were removed for this reason; if you have an account, the panel
  beats every inference here.
- [ ] **The exact panel path that registers the callback URL is unconfirmed.**
  Setup is described via the Automatic Actions system because that is the only
  place order state changes can trigger an outbound action, but BaseLinker
  documents no "send HTTP request" action.
- [ ] **Retry/redelivery behaviour is unspecified.** The examples return `400` for
  a missing/invalid `order_id` (repo convention) and note inline that acking `200`
  is a defensible alternative for an undocumented sender.

## Notes for reviewers

- **Do not add a signature verifier.** There is no header, no secret, and no
  signed content (a HEAD request has no body). Any `verifyBaselinkerSignature()`
  is fabrication.
- **`X-BLToken` is not a webhook signature.** It is the request auth header for
  *your* outbound calls to `api.baselinker.com` and never appears inbound.
- **The Automatic Actions system-event names are panel UI labels**, referenced as
  background only. They must not become wire-value constants.
- **Responses must stay bodyless** ([RFC 9110 §9.3.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.3.2)),
  including the `400`/`401` paths — hence `Response(status_code=…)` rather than
  `HTTPException` in FastAPI.
