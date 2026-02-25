// Generated with: openclaw-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

interface AgentHookPayload {
  message: string;
  name?: string;
  agentId?: string;
  sessionKey?: string;
  wakeMode?: 'now' | 'next-heartbeat';
  deliver?: boolean;
  channel?: string;
  to?: string;
  model?: string;
  thinking?: string;
  timeoutSeconds?: number;
}

function extractToken(
  authHeader: string | null,
  xTokenHeader: string | null
): string | null {
  if (xTokenHeader) return xTokenHeader;
  if (authHeader && authHeader.startsWith('Bearer '))
    return authHeader.slice(7);
  return null;
}

function verifyOpenClawWebhook(
  authHeader: string | null,
  xTokenHeader: string | null,
  secret: string
): boolean {
  const token = extractToken(authHeader, xTokenHeader);
  if (!token || !secret) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(secret)
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Reject query-string tokens
  if (request.nextUrl.searchParams.has('token')) {
    return NextResponse.json(
      { error: 'Query-string tokens not accepted' },
      { status: 400 }
    );
  }

  const authHeader = request.headers.get('authorization');
  const xToken = request.headers.get('x-openclaw-token');

  if (!verifyOpenClawWebhook(authHeader, xToken, process.env.OPENCLAW_HOOK_TOKEN!)) {
    console.error('OpenClaw token verification failed');
    return NextResponse.json(
      { error: 'Invalid token' },
      { status: 401 }
    );
  }

  const payload: AgentHookPayload = await request.json();

  if (!payload.message) {
    return NextResponse.json(
      { error: 'message is required' },
      { status: 400 }
    );
  }

  const hookName = payload.name || 'OpenClaw';
  console.log(`[${hookName}] Received agent hook`);
  console.log(`  message: ${payload.message}`);
  if (payload.agentId) console.log(`  agentId: ${payload.agentId}`);
  if (payload.model) console.log(`  model: ${payload.model}`);

  // TODO: Process the webhook payload

  return NextResponse.json({ received: true }, { status: 202 });
}
