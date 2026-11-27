import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

const TOKEN_SECRET = "test_token_secret_at_least_32_bytes_long";
const REQUEST_ID = "req-abc-123";
// Trimmed from Green Dot's documented transaction example (Webhook Events page).
const PAYLOAD = JSON.stringify({
  accounts: [
    {
      accountIdentifier: "f8e47e10-9ff9-449d-b3bc-d075947c9ff6",
      events: [
        {
          eventIdentifier: "4c579f23-bbd9-4033-96d9-4605eff580b1",
          eventType: "transaction",
          eventDateTime: "2026-06-22T03:56:08.370Z",
        },
      ],
    },
  ],
});

function makeToken(scope = "post:webhook"): string {
  return jwt.sign({ scope }, TOKEN_SECRET);
}

async function loadPOST() {
  // Reset the module registry so env changes are picked up on import.
  const mod = await import("../app/webhooks/greendot/route");
  return mod.POST;
}

function makeRequest(headers: Record<string, string>, body: string): NextRequest {
  return new NextRequest("http://localhost:3000/webhooks/greendot", {
    method: "POST",
    headers,
    body,
  });
}

describe("Green Dot webhook receiver (Next.js)", () => {
  beforeEach(() => {
    process.env.GREENDOT_WEBHOOK_TOKEN_SECRET = TOKEN_SECRET;
    process.env.GREENDOT_WEBHOOK_SCOPE = "post:webhook";
  });

  it("accepts a valid token and echoes x-GD-RequestId + responseDetails", async () => {
    const POST = await loadPOST();
    const res = await POST(
      makeRequest(
        {
          authorization: `Bearer ${makeToken()}`,
          "x-GD-RequestId": REQUEST_ID,
          "content-type": "application/json",
        },
        PAYLOAD
      )
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-GD-RequestId")).toBe(REQUEST_ID);
    const body = await res.json();
    expect(body.responseDetails[0]).toEqual({
      code: 0,
      subCode: 0,
      description: REQUEST_ID,
    });
  });

  it("rejects a missing bearer token with 401", async () => {
    const POST = await loadPOST();
    const res = await POST(
      makeRequest({ "content-type": "application/json" }, PAYLOAD)
    );
    expect(res.status).toBe(401);
  });

  it("rejects a token signed with the wrong secret with 401", async () => {
    const POST = await loadPOST();
    const bad = jwt.sign({ scope: "post:webhook" }, "wrong_secret");
    const res = await POST(
      makeRequest(
        { authorization: `Bearer ${bad}`, "content-type": "application/json" },
        PAYLOAD
      )
    );
    expect(res.status).toBe(401);
  });

  it("rejects a token missing the post:webhook scope with 401", async () => {
    const POST = await loadPOST();
    const res = await POST(
      makeRequest(
        {
          authorization: `Bearer ${makeToken("read:account")}`,
          "content-type": "application/json",
        },
        PAYLOAD
      )
    );
    expect(res.status).toBe(401);
  });

  it("ignores an x-gd-signature header (undocumented, not verified)", async () => {
    const POST = await loadPOST();
    const res = await POST(
      makeRequest(
        {
          authorization: `Bearer ${makeToken()}`,
          "x-GD-RequestId": REQUEST_ID,
          "x-gd-signature": "anything-here-is-not-checked",
          "content-type": "application/json",
        },
        PAYLOAD
      )
    );
    // The token is the gate; the signature header does not affect the outcome.
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid JSON after auth passes", async () => {
    const POST = await loadPOST();
    const res = await POST(
      makeRequest(
        { authorization: `Bearer ${makeToken()}`, "content-type": "application/json" },
        "{not json"
      )
    );
    expect(res.status).toBe(400);
  });
});
