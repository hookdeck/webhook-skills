// Generated with: sparkpost-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { issueToken, oauthConfigured, secureEquals } from '../../../lib/sparkpost-auth';

/**
 * Demo OAuth 2.0 token endpoint — the target for a webhook's
 * `auth_request_details.url` when `auth_type` is `"oauth2"`.
 *
 * SparkPost POSTs `auth_request_details.body` here (client_id, client_secret,
 * grant_type), stores the returned token, and then sends every batch with
 * `Authorization: Bearer {token}`. The GET webhook response shows SparkPost
 * keeping exactly the shape returned below:
 *   "auth_credentials": { "access_token": "<oauth token>", "expires_in": 3600 }
 *
 * IN PRODUCTION you would normally point `auth_request_details.url` at your real
 * authorization server (Auth0, Okta, Keycloak, ...) and validate incoming Bearer
 * tokens by JWT signature verification or token introspection. The in-memory
 * token store behind issueToken() is illustrative only.
 */
export async function POST(request: NextRequest) {
  if (!oauthConfigured()) {
    return NextResponse.json(
      { error: 'server_error', error_description: 'OAuth not configured' },
      { status: 500 }
    );
  }

  // SparkPost does NOT document whether it sends the token request as JSON or as
  // application/x-www-form-urlencoded, so accept both.
  let body: Record<string, unknown>;
  try {
    body = await parseTokenRequest(request);
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const clientId = body.client_id;
  const clientSecret = body.client_secret;
  const grantType = body.grant_type;

  // grant_type is treated as optional: SparkPost's documented body includes
  // "client_credentials", but the API reference only says the body "likely should
  // contain the client ID, client secret, and grant type".
  if (grantType !== undefined && grantType !== 'client_credentials') {
    return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 });
  }

  if (
    typeof clientId !== 'string' ||
    typeof clientSecret !== 'string' ||
    !secureEquals(clientId, process.env.SPARKPOST_OAUTH_CLIENT_ID as string) ||
    !secureEquals(clientSecret, process.env.SPARKPOST_OAUTH_CLIENT_SECRET as string)
  ) {
    return NextResponse.json({ error: 'invalid_client' }, { status: 401 });
  }

  return NextResponse.json(issueToken(), { status: 200 });
}

async function parseTokenRequest(request: NextRequest): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? '';
  const raw = await request.text();

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }

  // Default to JSON — including when no Content-Type is sent at all, but fall
  // back to form parsing if the body clearly isn't JSON.
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    if (raw.includes('=')) return Object.fromEntries(new URLSearchParams(raw));
    throw new Error('Unparseable token request body');
  }
}
