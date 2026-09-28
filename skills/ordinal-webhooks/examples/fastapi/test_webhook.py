import os

import pytest
from fastapi.testclient import TestClient

# The secret is a value YOU generate and configure on the Ordinal webhook's
# `headers` field. Ordinal issues NO signing secret and signs NOTHING — there is
# no HMAC to generate in these tests, only a static header to send.
SECRET = "a3f1c9e7b5d28046a3f1c9e7b5d280461122334455667788990011223344556677"

os.environ["ORDINAL_WEBHOOK_SECRET"] = SECRET
os.environ.pop("ORDINAL_WEBHOOK_SECRET_HEADER", None)  # exercise the default

from main import (  # noqa: E402
    app,
    extract_resource,
    idempotency_key_for,
    resource_key_for,
    secret_header_name,
    verify_ordinal_secret,
)

# raise_server_exceptions=False so a 500 comes back as a response, not a raised
# exception — the fail-closed path is part of what we are asserting.
client = TestClient(app, raise_server_exceptions=False)

# Documented delivery vectors, copied verbatim from the Ordinal docs.
POST_PUBLISHED = {
    "type": "post.published",
    "data": {
        "post": {
            "id": "550e8400-e29b-41d4-a716-446655440001",
            "title": "Q4 Product Launch Announcement",
            "channel": "LinkedIn",
            "campaign": {
                "id": "550e8400-e29b-41d4-a716-446655440003",
                "name": "Launch 2025",
                "startDate": "2025-01-01",
                "endDate": "2025-12-31",
            },
            "url": "https://app.tryordinal.com/acme/posts/550e8400-e29b-41d4-a716-446655440001",
            "postUrl": "https://www.linkedin.com/feed/update/urn:li:share:7123456789012345678",
            "profile": {
                "id": "550e8400-e29b-41d4-a716-446655440002",
                "name": "Acme Inc",
                "detail": "acme-inc",
            },
            "workspace": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "slug": "acme",
                "name": "Acme Inc",
            },
            "publishedBy": {
                "id": "550e8400-e29b-41d4-a716-446655440010",
                "firstName": "Jane",
                "lastName": "Doe",
                "email": "jane@example.com",
            },
            "publishedAt": "2025-02-26T14:30:00.000Z",
        }
    },
    "createdAt": "2025-02-26T14:30:00.000Z",
}

POST_PUBLISH_FAILED = {
    "type": "post.publish_failed",
    "data": {
        "post": {
            "id": "550e8400-e29b-41d4-a716-446655440001",
            "title": "Q4 Product Launch Announcement",
            "channel": "LinkedIn",
            "error": "Token expired",
            "campaign": None,
            "url": "https://app.tryordinal.com/acme/posts/550e8400-e29b-41d4-a716-446655440001",
            "profile": {
                "id": "550e8400-e29b-41d4-a716-446655440002",
                "name": "Acme Inc",
                "detail": "acme-inc",
            },
            "scheduledPublishAt": "2025-03-01T14:00:00.000Z",
            "workspace": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "slug": "acme",
                "name": "Acme Inc",
            },
            "createdBy": {
                "id": "550e8400-e29b-41d4-a716-446655440010",
                "firstName": "Jane",
                "lastName": "Doe",
                "email": "jane@example.com",
            },
            "failedAt": "2025-03-01T14:00:05.000Z",
        }
    },
    "createdAt": "2025-03-01T14:00:05.000Z",
}

POST_CREATED = {
    "type": "post.created",
    "data": {
        "post": {
            "id": "550e8400-e29b-41d4-a716-446655440001",
            "title": "Q4 Product Launch Announcement",
            "status": "draft",
            "channels": ["LinkedIn"],
            "campaign": None,
            "url": "https://app.tryordinal.com/acme/posts/550e8400-e29b-41d4-a716-446655440001",
            "labels": [
                {
                    "id": "550e8400-e29b-41d4-a716-446655440400",
                    "name": "Launch",
                    "color": "#ffffff",
                    "backgroundColor": "#1d4ed8",
                }
            ],
            "workspace": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "slug": "acme",
                "name": "Acme Inc",
            },
            "createdBy": {
                "id": "550e8400-e29b-41d4-a716-446655440010",
                "firstName": "Jane",
                "lastName": "Doe",
                "email": "jane@example.com",
            },
            "createdAt": "2025-02-26T09:00:00.000Z",
            "linkedIn": {
                "profile": {"id": "550e8400-e29b-41d4-a716-446655440002"},
                "copy": "Hi",
                "assets": [],
            },
            "x": None,
        }
    },
    "createdAt": "2025-02-26T09:00:00.000Z",
}

POST_COMMENT_CREATED = {
    "type": "post.comment.created",
    "data": {
        "comment": {
            "id": "550e8400-e29b-41d4-a716-446655440050",
            "message": "Looks good! Let's add a CTA at the end.",
            "post": {
                "id": "550e8400-e29b-41d4-a716-446655440001",
                "title": "Q4 Product Launch Announcement",
                "url": "https://app.tryordinal.com/acme/posts/550e8400-e29b-41d4-a716-446655440001",
            },
            "workspace": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "slug": "acme",
                "name": "Acme Inc",
            },
            "createdBy": {
                "id": "550e8400-e29b-41d4-a716-446655440010",
                "firstName": "Jane",
                "lastName": "Doe",
                "email": "jane@example.com",
            },
            "createdAt": "2025-02-26T16:00:00.000Z",
        }
    },
    "createdAt": "2025-02-26T16:00:00.000Z",
}

POST_APPROVAL_REQUESTED = {
    "type": "post.approval.requested",
    "data": {
        "approval": {
            "post": {
                "id": "550e8400-e29b-41d4-a716-446655440001",
                "title": "Q4 Product Launch Announcement",
                "url": "https://app.tryordinal.com/acme/posts/550e8400-e29b-41d4-a716-446655440001",
            },
            "campaign": {
                "id": "550e8400-e29b-41d4-a716-446655440003",
                "name": "Launch 2025",
                "startDate": "2025-01-01",
                "endDate": "2025-12-31",
            },
            "workspace": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "slug": "acme",
                "name": "Acme Inc",
            },
            "createdApprovals": [
                {
                    "id": "550e8400-e29b-41d4-a716-446655440700",
                    "isBlocking": True,
                    "message": "Please review before we publish.",
                    "dueDate": "2025-02-28T17:00:00.000Z",
                    "createdAt": "2025-02-26T14:00:00.000Z",
                    "status": "Requested",
                    "user": {
                        "id": "550e8400-e29b-41d4-a716-446655440020",
                        "firstName": "Alex",
                        "lastName": "Rivera",
                        "email": "alex@example.com",
                    },
                    "requestedBy": {
                        "id": "550e8400-e29b-41d4-a716-446655440010",
                        "firstName": "Jane",
                        "lastName": "Doe",
                        "email": "jane@example.com",
                    },
                }
            ],
            "existingApprovals": [],
        }
    },
    "createdAt": "2025-02-26T14:00:00.000Z",
}

CAMPAIGN_APPROVAL_REQUESTED = {
    "type": "campaign.approval.requested",
    "data": {
        "approval": {
            "campaign": {
                "id": "550e8400-e29b-41d4-a716-446655440003",
                "name": "Launch 2025",
                "startDate": "2025-01-01",
                "endDate": "2025-12-31",
            },
            "workspace": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "slug": "acme",
                "name": "Acme Inc",
            },
            "createdApprovals": [
                {
                    "id": "550e8400-e29b-41d4-a716-446655440710",
                    "isBlocking": True,
                    "message": "Legal sign-off needed for this campaign.",
                    "dueDate": "2025-03-05T17:00:00.000Z",
                    "createdAt": "2025-02-26T14:00:00.000Z",
                    "status": "Requested",
                    "user": {
                        "id": "550e8400-e29b-41d4-a716-446655440021",
                        "firstName": "Sam",
                        "lastName": "Chen",
                        "email": "sam@example.com",
                    },
                    "requestedBy": {
                        "id": "550e8400-e29b-41d4-a716-446655440010",
                        "firstName": "Jane",
                        "lastName": "Doe",
                        "email": "jane@example.com",
                    },
                }
            ],
            "existingApprovals": [],
        }
    },
    "createdAt": "2025-02-26T14:00:00.000Z",
}

SOCIAL_PROFILE_CONNECTED = {
    "type": "social_profile.connected",
    "data": {
        "profile": {
            "id": "550e8400-e29b-41d4-a716-446655440002",
            "name": "Acme Inc",
            "detail": "acme-inc",
            "channel": "LinkedIn",
            "profileImageUrl": "https://media.licdn.com/dms/image/acme",
            "workspace": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "slug": "acme",
                "name": "Acme Inc",
            },
            "connectedBy": {
                "id": "550e8400-e29b-41d4-a716-446655440010",
                "firstName": "Jane",
                "lastName": "Doe",
                "email": "jane@example.com",
            },
            "connectedAt": "2025-02-26T10:00:00.000Z",
        }
    },
    "createdAt": "2025-02-26T10:00:00.000Z",
}

INVITE_ACCEPTED = {
    "type": "invite.accepted",
    "data": {
        "invite": {
            "id": "550e8400-e29b-41d4-a716-446655440900",
            "email": "newuser@example.com",
            "createdAt": "2025-02-25T09:00:00.000Z",
            "acceptedAt": "2025-02-26T11:15:00.000Z",
            "invitedBy": {
                "id": "550e8400-e29b-41d4-a716-446655440010",
                "firstName": "Jane",
                "lastName": "Doe",
                "email": "jane@example.com",
            },
            "acceptedBy": {
                "id": "550e8400-e29b-41d4-a716-446655440030",
                "firstName": "New",
                "lastName": "User",
                "email": "newuser@example.com",
            },
            "workspace": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "slug": "acme",
                "name": "Acme Inc",
            },
        }
    },
    "createdAt": "2025-02-26T11:15:00.000Z",
}

ALL_TOPICS = [
    ("social_profile.connected", "profile"),
    ("social_profile.disconnected", "profile"),
    ("social_profile.reconnect_needed", "profile"),
    ("post.created", "post"),
    ("post.scheduled", "post"),
    ("post.rescheduled", "post"),
    ("post.unscheduled", "post"),
    ("post.published", "post"),
    ("post.publish_failed", "post"),
    ("post.archived", "post"),
    ("post.permanently_deleted", "post"),
    ("post.content.edited", "post"),
    ("post.comment.created", "comment"),
    ("post.inline_comment.created", "comment"),
    ("post.approval.requested", "approval"),
    ("post.approval.approved", "approval"),
    ("campaign.approval.requested", "approval"),
    ("campaign.approval.approved", "approval"),
    ("invite.created", "invite"),
    ("invite.accepted", "invite"),
]


@pytest.fixture(autouse=True)
def restore_env():
    """Each test starts from a configured secret and the default header name."""
    os.environ["ORDINAL_WEBHOOK_SECRET"] = SECRET
    os.environ.pop("ORDINAL_WEBHOOK_SECRET_HEADER", None)
    yield
    os.environ["ORDINAL_WEBHOOK_SECRET"] = SECRET
    os.environ.pop("ORDINAL_WEBHOOK_SECRET_HEADER", None)


def post(payload, secret=SECRET, header="x-webhook-secret"):
    """Send a delivery the way Ordinal does: plain JSON POST plus your static header."""
    headers = {"Content-Type": "application/json"}
    if secret is not None:
        headers[header] = secret
    if isinstance(payload, str):
        return client.post("/webhooks/ordinal", headers=headers, content=payload)
    return client.post("/webhooks/ordinal", headers=headers, json=payload)


class TestSecretHeaderName:
    def test_defaults_to_x_webhook_secret(self):
        # This name is OUR choice — it is not an Ordinal-defined header.
        assert secret_header_name() == "x-webhook-secret"

    def test_is_configurable(self):
        os.environ["ORDINAL_WEBHOOK_SECRET_HEADER"] = "X-Acme-Ordinal-Token"
        assert secret_header_name() == "x-acme-ordinal-token"


class TestVerifyOrdinalSecret:
    def test_accepts_a_matching_header(self):
        assert verify_ordinal_secret(SECRET, SECRET) is True

    def test_rejects_a_mismatched_header(self):
        assert verify_ordinal_secret("wrong", SECRET) is False

    def test_rejects_a_same_length_near_miss(self):
        near_miss = SECRET[:-1] + ("8" if SECRET.endswith("7") else "7")
        assert len(near_miss) == len(SECRET)
        assert verify_ordinal_secret(near_miss, SECRET) is False

    def test_rejects_a_missing_header(self):
        assert verify_ordinal_secret(None, SECRET) is False
        assert verify_ordinal_secret("", SECRET) is False

    def test_rejects_a_shorter_header_without_raising(self):
        assert verify_ordinal_secret("a", SECRET) is False

    def test_handles_non_ascii_without_raising_typeerror(self):
        # compare_digest() raises TypeError on non-ASCII str — we compare bytes.
        assert verify_ordinal_secret("sécret", SECRET) is False

    def test_fails_closed_when_the_expected_secret_is_unset(self):
        assert verify_ordinal_secret(SECRET, None) is False
        assert verify_ordinal_secret(SECRET, "") is False


class TestAuthentication:
    def test_accepts_a_delivery_with_the_configured_secret_header(self):
        response = post(POST_PUBLISHED)
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_returns_401_when_the_header_is_absent(self):
        response = post(POST_PUBLISHED, secret=None)
        assert response.status_code == 401
        assert response.json()["detail"] == "Unauthorized"

    def test_returns_401_when_the_header_is_wrong(self):
        response = post(POST_PUBLISHED, secret="not-the-secret")
        assert response.status_code == 401

    def test_accepts_the_header_regardless_of_case(self):
        assert post(POST_PUBLISHED, header="X-Webhook-Secret").status_code == 200

    def test_honours_a_custom_header_name(self):
        os.environ["ORDINAL_WEBHOOK_SECRET_HEADER"] = "X-Acme-Ordinal-Token"
        assert post(POST_PUBLISHED, header="X-Acme-Ordinal-Token").status_code == 200
        assert post(POST_PUBLISHED, header="x-webhook-secret").status_code == 401

    def test_returns_500_when_the_secret_is_unset_fail_closed(self):
        os.environ.pop("ORDINAL_WEBHOOK_SECRET", None)
        response = post(POST_PUBLISHED)
        assert response.status_code == 500
        assert response.json()["detail"] == "Webhook secret not configured"

    def test_never_accepts_an_unauthenticated_delivery_when_the_secret_is_unset(self):
        os.environ.pop("ORDINAL_WEBHOOK_SECRET", None)
        assert post(POST_PUBLISHED, secret=None).status_code != 200

    def test_returns_400_for_malformed_json(self):
        response = post("{not json")
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid JSON"

    def test_returns_400_when_the_envelope_has_no_type(self):
        response = post({"data": {}, "createdAt": "2025-02-26T14:30:00.000Z"})
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid payload"

    def test_does_not_require_a_raw_body(self):
        # Re-serialized JSON (reordered keys, extra whitespace) would break an
        # HMAC on a signed provider. Ordinal signs nothing, so it must be fine.
        import json

        reserialized = json.dumps(POST_PUBLISHED, indent=4, sort_keys=True)
        assert post(reserialized).status_code == 200


class TestResourceKeyFor:
    @pytest.mark.parametrize("event_type,key", ALL_TOPICS)
    def test_maps_each_topic_to_its_data_key(self, event_type, key):
        assert resource_key_for(event_type) == key

    def test_covers_all_twenty_documented_topics(self):
        assert len(ALL_TOPICS) == 20
        assert all(resource_key_for(t) is not None for t, _ in ALL_TOPICS)

    def test_returns_none_for_an_unknown_type(self):
        assert resource_key_for("something.else") is None
        assert resource_key_for(None) is None


class TestExtractResource:
    def test_reads_data_post_for_post_events(self):
        assert extract_resource(POST_PUBLISHED)["title"] == "Q4 Product Launch Announcement"

    def test_reads_data_comment_for_comment_events_not_data_post(self):
        assert "post" not in POST_COMMENT_CREATED["data"]
        resource = extract_resource(POST_COMMENT_CREATED)
        assert resource["message"] == "Looks good! Let's add a CTA at the end."
        assert resource["post"]["title"] == "Q4 Product Launch Announcement"

    def test_reads_data_approval_for_post_and_campaign_approvals(self):
        assert extract_resource(POST_APPROVAL_REQUESTED)["post"]["id"].endswith("0001")
        assert extract_resource(CAMPAIGN_APPROVAL_REQUESTED)["campaign"]["name"] == "Launch 2025"

    def test_reads_data_profile_and_data_invite(self):
        assert extract_resource(SOCIAL_PROFILE_CONNECTED)["channel"] == "LinkedIn"
        assert extract_resource(INVITE_ACCEPTED)["email"] == "newuser@example.com"

    def test_returns_empty_dict_when_data_is_missing(self):
        assert extract_resource({"type": "post.published"}) == {}


class TestIdempotencyKey:
    def test_the_envelope_has_no_event_id(self):
        # Ordinal documents no top-level event id and no delivery-id header.
        assert "id" not in POST_PUBLISHED

    def test_combines_type_resource_id_and_created_at(self):
        assert idempotency_key_for(POST_PUBLISHED) == (
            "post.published:550e8400-e29b-41d4-a716-446655440001:2025-02-26T14:30:00.000Z"
        )

    def test_falls_back_to_the_nested_post_id_for_post_approvals(self):
        assert idempotency_key_for(POST_APPROVAL_REQUESTED) == (
            "post.approval.requested:550e8400-e29b-41d4-a716-446655440001:2025-02-26T14:00:00.000Z"
        )

    def test_falls_back_to_the_nested_campaign_id_for_campaign_approvals(self):
        assert idempotency_key_for(CAMPAIGN_APPROVAL_REQUESTED) == (
            "campaign.approval.requested:550e8400-e29b-41d4-a716-446655440003:2025-02-26T14:00:00.000Z"
        )

    def test_is_stable_for_identical_redeliveries(self):
        assert idempotency_key_for(POST_PUBLISHED) == idempotency_key_for(dict(POST_PUBLISHED))


class TestEventDispatch:
    @pytest.mark.parametrize(
        "payload",
        [
            POST_PUBLISHED,
            POST_PUBLISH_FAILED,
            POST_CREATED,
            POST_COMMENT_CREATED,
            POST_APPROVAL_REQUESTED,
            CAMPAIGN_APPROVAL_REQUESTED,
            SOCIAL_PROFILE_CONNECTED,
            INVITE_ACCEPTED,
        ],
        ids=lambda p: p["type"],
    )
    def test_acknowledges_documented_deliveries(self, payload):
        assert post(payload).status_code == 200

    def test_surfaces_the_publish_failure_reason(self, capsys):
        post(POST_PUBLISH_FAILED)
        assert "Token expired" in capsys.readouterr().out

    def test_handles_a_null_campaign_and_null_post_url(self, capsys):
        payload = {
            **POST_PUBLISHED,
            "data": {"post": {**POST_PUBLISHED["data"]["post"], "campaign": None, "postUrl": None}},
        }
        assert post(payload).status_code == 200
        assert "(no channel URL)" in capsys.readouterr().out

    def test_reads_the_plural_channels_list_on_post_created(self, capsys):
        post(POST_CREATED)
        assert "[LinkedIn]" in capsys.readouterr().out

    @pytest.mark.parametrize("event_type,_key", ALL_TOPICS)
    def test_every_topic_dispatches_without_falling_through(self, event_type, _key, capsys):
        key = resource_key_for(event_type)
        payload = {
            "type": event_type,
            "data": {key: {"id": "550e8400-e29b-41d4-a716-446655440001"}},
            "createdAt": "2025-02-26T14:30:00.000Z",
        }
        assert post(payload).status_code == 200
        assert "Unhandled Ordinal event type" not in capsys.readouterr().out

    def test_acknowledges_an_unknown_future_event_type(self, capsys):
        payload = {
            "type": "post.something_new",
            "data": {"post": {"id": "x"}},
            "createdAt": "2025-02-26T14:30:00.000Z",
        }
        assert post(payload).status_code == 200
        assert "Unhandled Ordinal event type" in capsys.readouterr().out


class TestHealth:
    def test_health_check(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
