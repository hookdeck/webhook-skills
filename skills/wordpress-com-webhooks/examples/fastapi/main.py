# Generated with: wordpress-com-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

# WordPress.com webhooks (Settings -> Webhooks, the native
# /wp-admin/options-general.php?page=webhooks feature) are UNSIGNED:
#
#   1. There is NO signature, NO secret, NO timestamp and NO handshake. Do not
#      write an HMAC verifier and do not look for X-WordPress-Signature,
#      X-WP-Signature or X-WPCOM-Signature — none of them exist.
#      (X-WC-Webhook-Signature is WooCommerce, a different product.)
#   2. The body is a FLAT application/x-www-form-urlencoded key/value set — no
#      JSON envelope, no `type`, no `data` object, no event id. The
#      discriminator is the `hook` field.
#   3. Only the fields the admin ticked are sent, and every value is a STRING.
#
# The practical control is a random token YOU put in the registered URL's query
# string, compared in constant time. It is not provider authentication.

app = FastAPI(title="WordPress.com Webhook Handler")

# The three documented hooks. There are no others — no post_updated,
# delete_post, user_register or wp_insert_post.
PUBLISH_POST = "publish_post"
PUBLISH_PAGE = "publish_page"
COMMENT_POST = "comment_post"

# A parsed delivery: flat, string-valued, every key optional except `hook`.
Fields = Dict[str, Union[str, List[str]]]

_BRACKETED = re.compile(r"^([^\[]+)\[\d*\]$")


def verify_url_token(provided: Optional[str]) -> bool:
    """
    Compare the token YOU added to the registered webhook URL
    (https://example.com/webhooks/wordpress-com?token=<random>).

    This is NOT a WordPress.com signature — WordPress.com signs nothing. Raises
    when the env var is missing so the endpoint fails CLOSED rather than
    accepting everything.
    """
    expected = os.getenv("WORDPRESS_COM_WEBHOOK_TOKEN")
    if not expected:
        raise RuntimeError("WORDPRESS_COM_WEBHOOK_TOKEN is not set")
    if not provided:
        return False
    # Compare BYTES, not str: hmac.compare_digest() raises TypeError on str
    # values containing non-ASCII characters, and the token is attacker-supplied.
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


def group_fields(items: Sequence[Tuple[str, str]]) -> Fields:
    """
    Flatten form items into fields, grouping bracket-encoded arrays.

    http_build_query encodes array-valued fields such as post_category as
    `post_category[0]=1&post_category[1]=5`, so those (and any repeated key) are
    collected into a list.
    """
    fields: Fields = {}
    for key, value in items:
        match = _BRACKETED.match(key)
        name = match.group(1) if match else key
        existing = fields.get(name)
        if match or existing is not None:
            if isinstance(existing, list):
                existing.append(value)
            elif existing is None:
                fields[name] = [value]
            else:
                fields[name] = [existing, value]
        else:
            fields[name] = value
    return fields


def parse_json_fields(raw_body: bytes) -> Fields:
    """
    Parse a JSON body defensively.

    WordPress.com is expected to send application/x-www-form-urlencoded (inferred
    from the HookPress lineage, whose sender hands a PHP array to
    wp_remote_post -> http_build_query). JSON is accepted only as a cheap
    fallback — do not document it as what WordPress.com sends.
    """
    parsed = json.loads(raw_body)
    if not isinstance(parsed, dict):
        raise ValueError("JSON body is not an object")
    fields: Fields = {}
    for key, value in parsed.items():
        # Normalise to strings, matching the form-encoded path.
        fields[key] = [str(item) for item in value] if isinstance(value, list) else str(value)
    return fields


def one(fields: Fields, key: str) -> Optional[str]:
    """Read a single-valued field, ignoring repeated/bracketed values."""
    value = fields.get(key)
    return value if isinstance(value, str) else None


def dedupe_key(hook: str, fields: Fields) -> Optional[str]:
    """
    Build a dedupe key.

    publish_post / publish_page fire on the initial publish AND on every later
    edit of a published item, and there is no delivery-id header, so the same
    `ID` arrives repeatedly. post_modified_gmt (when the admin ticked it)
    distinguishes one edit from the next.
    """
    if hook == COMMENT_POST:
        comment_id = one(fields, "comment_ID")
        return f"{hook}:{comment_id}" if comment_id else None
    post_id = one(fields, "ID")
    if not post_id:
        return None
    return f"{hook}:{post_id}:{one(fields, 'post_modified_gmt') or 'unknown'}"


async def fetch_post(post_id: str) -> Optional[Dict[str, Any]]:
    """
    Re-fetch the authoritative post from the WordPress.com REST API.

    The delivery is unsigned, so the payload is an untrusted HINT: anyone who
    learns the URL can POST arbitrary values at you. Returns None when
    WORDPRESS_COM_SITE is not configured.
    """
    site = os.getenv("WORDPRESS_COM_SITE")
    if not site:
        return None

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://public-api.wordpress.com/rest/v1.1/sites/{site}/posts/{post_id}"
        )
    response.raise_for_status()
    return response.json()


# --- Event handlers (one per documented hook) --------------------------------


async def handle_publish_post(fields: Fields) -> None:
    print(
        f"Post published/updated: {one(fields, 'ID') or 'unknown ID'} — "
        f"{one(fields, 'post_title') or '(post_title not selected)'}"
    )
    # TODO: upsert keyed on ID (see dedupe_key), then act on fetch_post(ID).


async def handle_publish_page(fields: Fields) -> None:
    print(
        f"Page published/updated: {one(fields, 'ID') or 'unknown ID'} — "
        f"{one(fields, 'post_title') or '(post_title not selected)'}"
    )


async def handle_comment_post(fields: Fields) -> None:
    # comment_approved is a STRING: '1' approved, '0' pending moderation, 'spam'.
    # Comments can arrive before moderation — never publish comment_content blindly.
    approved = one(fields, "comment_approved")
    state = "approved" if approved == "1" else "spam" if approved == "spam" else "pending"
    print(
        f"Comment {one(fields, 'comment_ID') or 'unknown'} on post "
        f"{one(fields, 'comment_post_ID') or 'unknown'} ({state})"
    )


async def dispatch(hook: str, fields: Fields) -> Tuple[bool, Optional[str]]:
    """
    Dispatch on the `hook` field — the payload's only discriminator.

    An unknown hook is logged and the caller still answers 2xx: rejecting gains
    nothing from a sender with no documented retry policy.

    Returns (known, dedupe_key).
    """
    key = dedupe_key(hook, fields)
    if hook == PUBLISH_POST:
        await handle_publish_post(fields)
    elif hook == PUBLISH_PAGE:
        await handle_publish_page(fields)
    elif hook == COMMENT_POST:
        await handle_comment_post(fields)
    else:
        print(f"Unhandled WordPress.com hook: {hook}")
        return False, key
    return True, key


@app.post("/webhooks/wordpress-com")
async def handle_wordpress_com_webhook(request: Request) -> Response:
    """Receive a WordPress.com webhook: unsigned, flat, form-encoded."""
    # 1. Validate the URL token before touching the body.
    try:
        if not verify_url_token(request.query_params.get("token")):
            print("WordPress.com webhook rejected: URL token missing or mismatched")
            return Response("Invalid webhook token", status_code=401, media_type="text/plain")
    except RuntimeError as err:
        print(f"WordPress.com webhook misconfigured: {err}")
        # Fail CLOSED — never accept a delivery we cannot authenticate at all.
        return Response("Webhook token not configured", status_code=500, media_type="text/plain")

    # 2. Parse the flat body. `await request.form()` handles
    # application/x-www-form-urlencoded (it needs python-multipart installed).
    content_type = (request.headers.get("content-type") or "").lower()
    try:
        if "application/json" in content_type:
            fields = parse_json_fields(await request.body())
        else:
            form = await request.form()
            fields = group_fields([(k, str(v)) for k, v in form.multi_items()])
    except (ValueError, UnicodeDecodeError) as err:
        print(f"WordPress.com webhook body could not be parsed: {err}")
        return Response("Invalid body", status_code=400, media_type="text/plain")

    # 3. `hook` is the only field WordPress.com always includes. There is no
    # `type`, no `event`, and nothing nested to read it out of.
    hook = one(fields, "hook")
    if not hook:
        print("WordPress.com webhook rejected: no `hook` field in the body")
        return Response("Missing hook field", status_code=400, media_type="text/plain")

    # 4. Dispatch. No retry policy is documented, so keep this short — in
    # production hand the work to a background task or queue and acknowledge now.
    try:
        _known, key = await dispatch(hook, fields)
        if key:
            print(f"Processed {key}")
    except Exception as err:  # noqa: BLE001 - never leak a 500 to the sender
        print(f"WordPress.com webhook processing failed: {err}")

    return Response("OK", status_code=200, media_type="text/plain")


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    if not os.getenv("WORDPRESS_COM_WEBHOOK_TOKEN"):
        print(
            "WORDPRESS_COM_WEBHOOK_TOKEN is not set — every delivery will be answered "
            "with 500 (fail closed). Generate one with `openssl rand -hex 32` and add "
            "?token=<value> to the URL you register in Settings -> Webhooks."
        )
    uvicorn.run(app, host="0.0.0.0", port=8000)
