// Generated with: microsoft-teams-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { buildReply, commandText, verifyTeamsRequest, type TeamsActivity } from '../../../lib/verify-teams';

export async function POST(request: Request) {
  const securityToken = process.env.MICROSOFT_TEAMS_SECURITY_TOKEN;
  if (!securityToken) {
    console.error('MICROSOFT_TEAMS_SECURITY_TOKEN is not set: rejecting request');
    return NextResponse.json({ error: 'Security token not configured' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyTeamsRequest(rawBody, request.headers.get('authorization'), securityToken)) {
    return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 });
  }

  let activity: TeamsActivity;
  try {
    activity = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log(`Teams message ${activity.id} from ${activity.from?.name}: ${commandText(activity.text)}`);

  // Teams posts this JSON as a reply to the message that mentioned the webhook.
  // Respond within about 5 seconds.
  return NextResponse.json(buildReply(activity));
}
