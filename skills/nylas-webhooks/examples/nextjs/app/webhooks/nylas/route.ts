// Generated with: nylas-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from "crypto";
import zlib from "zlib";
import { NextResponse } from "next/server";

/**
 * Verify a Nylas webhook signature.
 *
 * Nylas signs the RAW request body with HMAC-SHA256 keyed on the
 * per-destination webhook_secret and sends the hex digest in the
 * `x-nylas-signature` header. Only the body is signed (NOT Standard Webhooks).
 * When Content-Encoding is gzip, the signature covers the COMPRESSED bytes.
 */
export function verifyNylasSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false; // different lengths / non-hex => invalid
  }
}

// --- Challenge handshake (endpoint verification) ---------------------------
// When the webhook is created, Nylas GETs this URL with ?challenge=<value>.
// Echo the exact value back as plain text with 200 within 20 seconds.
export async function GET(request: Request): Promise<Response> {
  const challenge = new URL(request.url).searchParams.get("challenge");
  return new NextResponse(challenge ?? "", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

// --- Notification handler --------------------------------------------------
export async function POST(request: Request): Promise<Response> {
  // arrayBuffer() gives us the exact bytes Nylas signed, before parsing.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get("x-nylas-signature");

  if (!verifyNylasSignature(rawBody, signature, process.env.NYLAS_WEBHOOK_SECRET)) {
    console.error("Nylas webhook signature verification failed");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  // Signature valid — decompress (if needed) and parse.
  let event: NylasEvent;
  try {
    const buf =
      request.headers.get("content-encoding") === "gzip"
        ? zlib.gunzipSync(rawBody)
        : rawBody;
    event = JSON.parse(buf.toString("utf8"));
  } catch {
    return new NextResponse("Invalid payload", { status: 400 });
  }

  // Nylas payloads follow CloudEvents 1.0: trigger in `type`, resource in `data.object`.
  // `type` can carry suffixes you didn't subscribe to: `.truncated` (body
  // removed, fetch the message by ID) and `.transformed` (customized fields).
  const { id, data } = event;
  const type = String(event.type).replace(/(\.(?:truncated|transformed))+$/, "");
  const object = data?.object ?? {};
  // Some types put grant_id in `data`, most in `data.object`.
  const grantId = data?.grant_id ?? object.grant_id;
  console.log(`Received ${type} (id: ${id}, grant: ${grantId})`);

  switch (type) {
    case "message.created":
      console.log("New message:", object.subject);
      // Your code: parse the email, run automation, notify, etc.
      break;
    case "message.updated":
      console.log("Message updated:", object.id);
      break;
    case "message.opened":
      console.log("Tracked message opened:", object.message_id ?? object.id);
      break;
    case "message.link_clicked":
      console.log("Tracked link clicked:", object.id);
      break;
    case "message.bounce_detected":
      console.log("Message bounced:", object.id);
      break;
    case "event.created":
      console.log("Calendar event created:", object.title ?? object.id);
      break;
    case "event.updated":
      console.log("Calendar event updated:", object.id);
      break;
    case "event.deleted":
      console.log("Calendar event deleted:", object.id);
      break;
    case "grant.created":
      console.log("Grant created (account connected):", grantId);
      break;
    case "grant.expired":
      console.log("Grant expired — re-auth required:", grantId);
      break;
    case "grant.deleted":
      console.log("Grant deleted (account disconnected):", grantId);
      break;
    default:
      console.log(`Unhandled trigger: ${type}`);
  }

  // Acknowledge quickly. Do heavy work asynchronously.
  return new NextResponse("OK", { status: 200 });
}

interface NylasEvent {
  specversion?: string;
  type?: string;
  source?: string;
  id?: string;
  time?: number;
  webhook_delivery_attempt?: number;
  data?: {
    application_id?: string;
    grant_id?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    object?: Record<string, any>;
  };
}
