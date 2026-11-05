// Generated with: papergames-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextResponse } from 'next/server';

// Svix reference libraries default to 5 minutes; Papergames publishes no tolerance. 0 disables the check.
const DEFAULT_TOLERANCE_SECONDS = 300;

interface PapergamesPlayer {
  externalId?: string; // only present if you passed externalUserId on the iframe URL
  name: string;
  score: number;
}

interface PapergamesGameSession {
  uid: string;
  gamesPlayed: number;
  players: PapergamesPlayer[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface PapergamesEvent {
  eventType: string;
  payload: PapergamesGameSession;
}

// `whsec_<base64>`: base64-decode the part after the prefix. A value without the prefix is
// base64-decoded whole (Standard Webhooks rule). Returns null for a secret that decodes to nothing.
function decodeSecret(secret: string): Buffer | null {
  const encoded = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const key = Buffer.from(encoded, 'base64');
  return key.length > 0 ? key : null;
}

function readTolerance(): number {
  const raw = process.env.PAPERGAMES_WEBHOOK_TOLERANCE_SECONDS;
  if (raw === undefined || raw === '') return DEFAULT_TOLERANCE_SECONDS;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_TOLERANCE_SECONDS;
}

// Papergames is delivered by Svix: HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${raw body}`,
// base64-encoded, compared against every `v1,<base64>` entry in the space-delimited svix-signature header.
function verifySignature(rawBody: string, msgId: string, timestamp: string, signatureHeader: string, key: Buffer): boolean {
  const expected = Buffer.from(
    crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${rawBody}`).digest('base64')
  );
  return signatureHeader.split(' ').some((entry) => {
    const [version, signature] = entry.split(',', 2);
    if (version !== 'v1' || !signature) return false; // ignore unknown version tags
    const candidate = Buffer.from(signature);
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}

// Winner is not a field: derive it by comparing scores (ties produce several leaders)
function leaders(players: PapergamesPlayer[]): PapergamesPlayer[] {
  if (players.length === 0) return [];
  const top = Math.max(...players.map((p) => Number(p.score) || 0));
  return players.filter((p) => (Number(p.score) || 0) === top);
}

function playerLabel(player: PapergamesPlayer): string {
  return player.externalId ? `${player.name} (${player.externalId})` : String(player.name);
}

export async function POST(request: Request) {
  const secret = process.env.PAPERGAMES_WEBHOOK_SECRET;
  const key = secret ? decodeSecret(secret) : null;
  if (!key) {
    console.error('PAPERGAMES_WEBHOOK_SECRET is missing or not a valid whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const msgId = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signatureHeader = request.headers.get('svix-signature');
  if (!msgId || !timestamp || !signatureHeader) {
    return NextResponse.json(
      { error: 'Missing svix-id, svix-timestamp or svix-signature header' },
      { status: 400 }
    );
  }

  if (!/^\d+$/.test(timestamp) || Number(timestamp) <= 0) {
    return NextResponse.json({ error: 'Invalid svix-timestamp header' }, { status: 400 });
  }
  const tolerance = readTolerance();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > tolerance) {
    return NextResponse.json({ error: 'Timestamp outside tolerance' }, { status: 400 });
  }

  // IMPORTANT: read the raw body; never verify re-serialized JSON
  const rawBody = await request.text();
  if (!verifySignature(rawBody, msgId, timestamp, signatureHeader, key)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification: the event type is in the body, not in a header
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Documented examples put { eventType, payload } at the root; the docs' prose calls the root
  // `webhookPayload`, so tolerate the envelope arriving one level deeper.
  const root = body as Record<string, unknown>;
  const envelope = (
    root.webhookPayload && typeof root.webhookPayload === 'object' ? root.webhookPayload : root
  ) as Partial<PapergamesEvent>;
  const { eventType } = envelope;
  const session = (envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {}) as Partial<PapergamesGameSession>;
  const players = Array.isArray(session.players) ? session.players : [];

  // svix-id is the same on every retry of a message: deduplicate on it. Ordering is not guaranteed,
  // so key game state on session.uid + session.gamesPlayed rather than on arrival order.
  console.log(`Received Papergames webhook ${msgId}: ${eventType} (session ${session.uid})`);

  switch (eventType) {
    case 'game.started':
      // Fires for each game in the session, so it can arrive several times per uid
      console.log(`Game started in session ${session.uid}, games played so far: ${session.gamesPlayed}`);
      console.log('Players:', players.map(playerLabel).join(', '));
      break;
    case 'game.finished': {
      // `status` stays "playing" here because a session can hold several games: rely on the event type
      const top = leaders(players);
      console.log(`Game finished in session ${session.uid}, games played: ${session.gamesPlayed}`);
      console.log('Leading:', top.map(playerLabel).join(', '), 'with score', top[0] ? top[0].score : 0);
      break;
    }
    default:
      // Endpoints subscribe to chosen events and the list may grow: acknowledge anything else
      console.log('Unhandled Papergames event type:', eventType);
  }

  // Return 2xx quickly; move slow work to a queue
  return NextResponse.json({ received: true });
}
