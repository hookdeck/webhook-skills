import os

import pytest
from fastapi.testclient import TestClient

# The URL token is NOT a WordPress.com signature — WordPress.com signs nothing.
# It is a random value YOU add to the registered webhook URL's query string.
# main.py reads it per request, so tests can unset it to prove the fail-closed path.
TOKEN = "test_url_token_2f1c9b7ad4e6"
os.environ["WORDPRESS_COM_WEBHOOK_TOKEN"] = TOKEN
# Keep the REST fetch-back inert so tests make no network calls.
os.environ.pop("WORDPRESS_COM_SITE", None)

from main import (  # noqa: E402
    COMMENT_POST,
    PUBLISH_PAGE,
    PUBLISH_POST,
    dedupe_key,
    dispatch,
    group_fields,
    parse_json_fields,
    verify_url_token,
)
from main import app  # noqa: E402

client = TestClient(app)

PATH = "/webhooks/wordpress-com"
FORM_HEADERS = {"Content-Type": "application/x-www-form-urlencoded"}


@pytest.fixture(autouse=True)
def _restore_token():
    """Every test starts with the token configured."""
    os.environ["WORDPRESS_COM_WEBHOOK_TOKEN"] = TOKEN
    yield
    os.environ["WORDPRESS_COM_WEBHOOK_TOKEN"] = TOKEN


def post_form(fields, token=TOKEN):
    """Send a delivery: a flat application/x-www-form-urlencoded body."""
    params = {} if token is None else {"token": token}
    return client.post(PATH, params=params, data=fields, headers=FORM_HEADERS)


class TestVerifyUrlToken:
    def test_accepts_matching_token(self):
        assert verify_url_token(TOKEN) is True

    def test_rejects_wrong_token_of_same_length(self):
        assert verify_url_token("x" * len(TOKEN)) is False

    def test_rejects_length_mismatch(self):
        assert verify_url_token(TOKEN + "x") is False

    def test_rejects_missing_token(self):
        assert verify_url_token(None) is False
        assert verify_url_token("") is False

    def test_rejects_non_ascii_token(self):
        # compare_digest() raises TypeError on non-ASCII str input, so the
        # comparison must happen on bytes.
        assert verify_url_token("ü") is False

    def test_raises_when_not_configured(self):
        # Fail CLOSED: an unconfigured endpoint must never accept everything.
        del os.environ["WORDPRESS_COM_WEBHOOK_TOKEN"]
        with pytest.raises(RuntimeError, match="WORDPRESS_COM_WEBHOOK_TOKEN"):
            verify_url_token(TOKEN)


class TestParsing:
    def test_group_fields_keeps_single_values_as_strings(self):
        assert group_fields([("hook", "publish_post"), ("ID", "42")]) == {
            "hook": "publish_post",
            "ID": "42",
        }

    def test_group_fields_groups_bracketed_arrays(self):
        fields = group_fields([("post_category[0]", "1"), ("post_category[1]", "5")])
        assert fields["post_category"] == ["1", "5"]

    def test_group_fields_groups_repeated_keys(self):
        assert group_fields([("to_ping", "a"), ("to_ping", "b")])["to_ping"] == ["a", "b"]

    def test_parse_json_fields_normalises_to_strings(self):
        assert parse_json_fields(b'{"hook":"publish_post","ID":42}') == {
            "hook": "publish_post",
            "ID": "42",
        }

    def test_parse_json_fields_rejects_non_object(self):
        with pytest.raises(ValueError):
            parse_json_fields(b"[1,2,3]")

    def test_parse_json_fields_rejects_malformed_json(self):
        with pytest.raises(ValueError):
            parse_json_fields(b"{not json")


class TestDedupeKey:
    def test_keys_posts_on_hook_id_and_modified_gmt(self):
        key = dedupe_key(PUBLISH_POST, {"ID": "42", "post_modified_gmt": "2026-09-28 10:15:00"})
        assert key == "publish_post:42:2026-09-28 10:15:00"

    def test_falls_back_when_modified_gmt_not_selected(self):
        assert dedupe_key(PUBLISH_PAGE, {"ID": "7"}) == "publish_page:7:unknown"

    def test_keys_comments_on_comment_id(self):
        assert dedupe_key(COMMENT_POST, {"comment_ID": "99"}) == "comment_post:99"

    def test_returns_none_when_id_not_selected(self):
        assert dedupe_key(PUBLISH_POST, {}) is None
        assert dedupe_key(COMMENT_POST, {}) is None


class TestDispatch:
    @pytest.mark.anyio
    async def test_routes_all_three_documented_hooks(self):
        assert (await dispatch(PUBLISH_POST, {"ID": "42"}))[0] is True
        assert (await dispatch(PUBLISH_PAGE, {"ID": "7"}))[0] is True
        assert (await dispatch(COMMENT_POST, {"comment_ID": "99"}))[0] is True

    @pytest.mark.anyio
    async def test_unknown_hook_is_logged_not_raised(self, capsys):
        known, _key = await dispatch("post_updated", {"ID": "1"})
        assert known is False
        assert "post_updated" in capsys.readouterr().out


class TestWebhookEndpoint:
    def test_accepts_publish_post(self):
        response = post_form(
            {
                "hook": "publish_post",
                "ID": "42",
                "post_title": "Hello world",
                "post_status": "publish",
                "post_url": "https://example.wordpress.com/2026/09/28/hello-world/",
            }
        )
        assert response.status_code == 200

    def test_accepts_publish_page(self):
        response = post_form({"hook": "publish_page", "ID": "7", "post_title": "About"})
        assert response.status_code == 200

    def test_accepts_comment_post(self):
        response = post_form(
            {
                "hook": "comment_post",
                "comment_ID": "99",
                "comment_post_ID": "42",
                "comment_approved": "0",
                "comment_author": "Anon",
                "comment_content": "Nice post",
            }
        )
        assert response.status_code == 200

    def test_accepts_hook_only_delivery(self):
        # Every field except `hook` is optional — only ticked fields are sent.
        assert post_form({"hook": "publish_post"}).status_code == 200

    def test_decodes_bracket_encoded_arrays(self):
        response = client.post(
            PATH,
            params={"token": TOKEN},
            content="hook=publish_post&ID=42&post_category[0]=1&post_category[1]=5",
            headers=FORM_HEADERS,
        )
        assert response.status_code == 200

    def test_unknown_hook_returns_200_and_logs(self, capsys):
        response = post_form({"hook": "wp_insert_post", "ID": "42"})
        assert response.status_code == 200
        assert "wp_insert_post" in capsys.readouterr().out

    def test_accepts_json_body_defensively(self):
        # Not what WordPress.com sends — accepted because it is cheap and harmless.
        response = client.post(
            PATH,
            params={"token": TOKEN},
            json={"hook": "publish_post", "ID": "42", "post_title": "Hello world"},
        )
        assert response.status_code == 200

    def test_missing_hook_returns_400(self):
        response = post_form({"ID": "42", "post_title": "Hello world"})
        assert response.status_code == 400

    def test_malformed_json_returns_400(self):
        response = client.post(
            PATH,
            params={"token": TOKEN},
            content="{not json",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400

    def test_missing_token_returns_401(self):
        response = post_form({"hook": "publish_post", "ID": "42"}, token=None)
        assert response.status_code == 401

    def test_wrong_token_returns_401(self):
        response = post_form({"hook": "publish_post", "ID": "42"}, token="wrong-token")
        assert response.status_code == 401

    def test_non_ascii_token_returns_401_not_500(self):
        response = post_form({"hook": "publish_post", "ID": "42"}, token="ü")
        assert response.status_code == 401

    def test_unset_env_token_fails_closed_with_500(self):
        del os.environ["WORDPRESS_COM_WEBHOOK_TOKEN"]
        response = post_form({"hook": "publish_post", "ID": "42"})
        assert response.status_code == 500

    def test_get_is_not_allowed(self):
        # WordPress.com only ever POSTs; the route is registered with @app.post.
        assert client.get(PATH, params={"token": TOKEN}).status_code == 405


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
