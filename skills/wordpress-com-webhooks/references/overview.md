# WordPress.com Webhooks Overview

## What Are WordPress.com Webhooks?

WordPress.com (Automattic's hosted WordPress service) ships a native webhooks
feature under **Settings → Webhooks**, documented at
[wordpress.com/support/webhooks/](https://wordpress.com/support/webhooks/) ("Use
WordPress.com Webhooks", last reviewed 2026-08-11).

An admin adds a webhook by choosing:

1. an **action** — the WordPress hook that triggers the delivery,
2. the **fields** to include in the POST body,
3. the **URL** to POST to.

From the docs: *"The URL will receive an HTTP POST request when the selected
action fires. The post data will contain the selected fields and one additional
field called `hook`, that contains the action title."*

The docs describe no signing secret, no signature header, no handshake, no
delivery log, no retry policy and no test button — see
[verification.md](verification.md).

## What This Is Not

- **WooCommerce.** A different product with its own signed scheme
  (`X-WC-Webhook-Signature`, HMAC-SHA256 base64). Use the
  [woocommerce-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/woocommerce-webhooks)
  skill. Never borrow its headers or verifier here.
- **Self-hosted WordPress.org webhook plugins** (WP Webhooks, the HookPress
  plugin, …). Verbatim from the docs: *"The Webhook settings mentioned on this
  page do not apply to plugin-enabled sites. Various plugins offer similar
  functionality."*
- **The WordPress.com REST API** (`public-api.wordpress.com`) — an API you call,
  not webhooks you receive. It is useful here for re-fetching authoritative data.
- **Jetpack Forms webhooks** — a separate per-form mechanism (see the bottom of
  this file).

## The Three Hooks (Complete List)

The `hook` field carries the action name. There are exactly three, and the
descriptions below are verbatim from the documentation.

### `publish_post`

> Runs when a post is published, or if it is edited and its status is
> "published".

### `publish_page`

> Runs when a page is published, or if it is edited and its status is
> "published".

Both post hooks offer the same selectable fields:

| Field | Notes |
|---|---|
| `ID` | The post/page ID. A string on the wire — coerce it. |
| `comment_count` | |
| `comment_status` | e.g. `open`, `closed` |
| `guid` | |
| `menu_order` | |
| `ping_status` | |
| `pinged` | |
| `post_author` | Author user ID |
| `post_category` | Array-valued — may arrive bracket-encoded (`post_category[0]=1`) |
| `post_content` | Raw content |
| `post_content_filtered` | |
| `post_date` | Site-local time |
| `post_date_gmt` | |
| `post_excerpt` | |
| `post_mime_type` | |
| `post_modified` | |
| `post_modified_gmt` | **Useful as a dedupe component** |
| `post_name` | The slug |
| `post_parent` | |
| `post_password` | **Sensitive** — only select it if you truly need it |
| `post_status` | e.g. `publish` |
| `post_title` | |
| `post_type` | `post` or `page` |
| `post_url` | Not a native `WP_Post` column — HookPress adds it via `get_permalink()`. It is in the documented field list, so it is fine to use. |
| `to_ping` | |

### `comment_post`

> Runs just after a comment is saved in the database.

| Field | Notes |
|---|---|
| `comment_ID` | **The dedupe key for comments** |
| `comment_agent` | Submitting user agent |
| `comment_approved` | String: `1` approved, `0` pending moderation, `spam` spam |
| `comment_author` | |
| `comment_author_IP` | **Sensitive** (personal data) |
| `comment_author_email` | **Sensitive** (personal data) |
| `comment_author_url` | |
| `comment_content` | Untrusted user input — do not render or publish it blindly |
| `comment_date` | |
| `comment_date_gmt` | |
| `comment_karma` | |
| `comment_parent` | Parent comment ID, `0` for top-level |
| `comment_post_ID` | The post the comment belongs to |
| `comment_type` | e.g. `comment`, `pingback` |
| `user_id` | `0` for anonymous commenters |

**Do not invent other hooks.** There is no `post_updated`, `delete_post`,
`user_register` or `wp_insert_post` in this feature. An unrecognised `hook`
value should be logged and acknowledged with a 2xx, not rejected — rejecting
gains you nothing against a sender with no documented retry policy.

## Event Payload Structure

The body is a **flat** set of key/value pairs. There is no JSON envelope, no
`type`, no `data` object and no event id. The only guaranteed field is `hook`;
everything else appears only if the admin ticked it.

```
POST /webhooks/wordpress-com?token=<random> HTTP/1.1
Content-Type: application/x-www-form-urlencoded

hook=publish_post&ID=42&post_title=Hello+world&post_status=publish&post_modified_gmt=2026-09-28+10%3A15%3A00
```

Equivalent as a decoded map:

| Key | Value |
|---|---|
| `hook` | `publish_post` |
| `ID` | `42` (string) |
| `post_title` | `Hello world` |
| `post_status` | `publish` |
| `post_modified_gmt` | `2026-09-28 10:15:00` |

Rules that follow from that shape:

1. **Every value is a string.** `ID=123`, `comment_approved=1`, `user_id=0`.
2. **Every field except `hook` is optional.** Guard each access.
3. **Array-valued fields may be bracket-encoded**: `post_category[0]=1&post_category[1]=5`.
4. **The Content-Type is not documented.** The feature derives from HookPress
   (`mitcho/hookpress`), whose `hookpress_generic_action()` passes a PHP array as
   `body` to `wp_remote_post`; WordPress's HTTP API encodes that with
   `http_build_query` and sends `application/x-www-form-urlencoded`. So
   form-encoded is the expected format — **inferred from that lineage**, because
   WordPress.com's own fork is closed source. Accept `application/json`
   defensively too; it costs nothing and is harmless.

## Duplicates and Missed Events

- `publish_post` and `publish_page` fire on the initial publish **and on every
  later edit** of a published item, so the same `ID` arrives repeatedly.
- There is no delivery-id, event-id or timestamp header to dedupe on.
- Dedupe on `hook` + `ID` + `post_modified_gmt` (when selected), or treat the
  handler as an upsert keyed on `ID`. For comments, key on `comment_ID`.
- The docs document no retries and no delivery log, so **assume no retries** and
  reconcile missed events from the REST API:

```bash
curl https://public-api.wordpress.com/rest/v1.1/sites/example.wordpress.com/posts/123
```

## Related Mechanism: Jetpack Forms Webhooks

Jetpack Forms has a **separate** per-form webhook feature
(`Automattic/jetpack`, `projects/packages/forms/src/service/class-form-webhooks.php`):
webhooks are configured on the contact-form block's `webhooks` attribute and
POSTed when the form is submitted.

- Also **unsigned** — the request sets only `Content-Type` and a `user-agent` of
  the form `WordPress/{wp_version} | Jetpack/{version}; {site_url}`.
- Format is `json` (default, `application/json`) or `urlencoded`
  (`application/x-www-form-urlencoded`).
- The body is the form's field id → value map, filterable via
  `jetpack_forms_before_webhook_request`.
- **There is no `hook` field**, so it is not interchangeable with the
  Settings → Webhooks payloads above.

The examples in this skill target the native WordPress.com webhooks, not Jetpack
Forms.

## Full Reference

- [Use WordPress.com Webhooks](https://wordpress.com/support/webhooks/) — the
  authoritative documentation for this feature
- [WordPress.com REST API](https://developer.wordpress.com/docs/api/) — for
  re-fetching authoritative post and comment data
