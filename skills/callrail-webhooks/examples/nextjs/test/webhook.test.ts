import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import {
  classifyCallRailEvent,
  isTimestampFresh,
  verifyCallRailSignature,
} from '../lib/verify-callrail';
import { POST } from '../app/webhooks/callrail/route';

// CallRail signing keys are random 32-char hex strings, but used as plain strings
const SIGNING_KEY = '072e77e426f92738a72fe23c4d1953b4'; // key from the CallRail docs test vector

// Request body from the CallRail docs (compact, no trailing newline)
const DOCS_BODY = "{\"answered\":false,\"business_phone_number\":\"\",\"call_type\":\"voicemail\",\"company_id\":155920786,\"company_name\":\"Boost Marketing\",\"company_time_zone\":\"America/Los_Angeles\",\"created_at\":\"2018-02-19T13:41:00.252-05:00\",\"customer_city\":\"Rochester\",\"customer_country\":\"US\",\"customer_name\":\"Kaylah Mills\",\"customer_phone_number\":\"+12148654559\",\"customer_state\":\"PA\",\"device_type\":\"\",\"direction\":\"inbound\",\"duration\":\"13\",\"first_call\":false,\"formatted_call_type\":\"Voicemail\",\"formatted_customer_location\":\"Rochester, PA\",\"formatted_business_phone_number\":\"\",\"formatted_customer_name\":\"Kaylah Mills\",\"prior_calls\":16,\"formatted_customer_name_or_phone_number\":\"Kaylah Mills\",\"formatted_customer_phone_number\":\"214-865-4559\",\"formatted_duration\":\"13s\",\"formatted_tracking_phone_number\":\"404-555-8514\",\"formatted_tracking_source\":\"Google Paid\",\"formatted_value\":\"--\",\"good_lead_call_id\":715587840,\"good_lead_call_time\":\"2016-06-17T10:23:33.363-04:00\",\"id\":766970532,\"lead_status\":\"previously_marked_good_lead\",\"note\":\"\",\"recording\":\"https://app.callrail.com/calls/766970532/recording/redirect?access_key=aaaaccccddddeeee\",\"recording_duration\":8,\"source_name\":\"Google AdWords\",\"start_time\":\"2018-02-19T13:41:00.236-05:00\",\"tags\":[],\"total_calls\":17,\"tracking_phone_number\":\"+14045558514\",\"transcription\":\"\",\"value\":\"\",\"voicemail\":true,\"tracker_id\":354024023,\"keywords\":\"\",\"medium\":\"\",\"referring_url\":\"\",\"landing_page_url\":\"\",\"last_requested_url\":\"\",\"referrer_domain\":\"\",\"conversational_transcript\":\"\",\"utm_source\":\"google\",\"utm_medium\":\"cpc\",\"utm_term\":\"\",\"utm_content\":\"\",\"utm_campaign\":\"Google AdWords\",\"utma\":\"\",\"utmb\":\"\",\"utmc\":\"\",\"utmv\":\"\",\"utmz\":\"\",\"ga\":\"\",\"gclid\":\"\",\"integration_data\":[{\"integration\":\"Webhooks\",\"data\":null}],\"keywords_spotted\":\"\",\"recording_player\":\"https://app.callrail.com/calls/766970532/recording?access_key=aaaabbbbccccdddd\",\"speaker_percent\":\"\",\"call_highlights\":[],\"callercity\":\"Rochester\",\"callercountry\":\"US\",\"callername\":\"Kaylah Mills\",\"callernum\":\"+12148654559\",\"callerstate\":\"PA\",\"callsource\":\"google_paid\",\"campaign\":\"\",\"custom\":\"\",\"datetime\":\"2018-02-19 18:41:00\",\"destinationnum\":\"\",\"ip\":\"\",\"kissmetrics_id\":\"\",\"landingpage\":\"\",\"referrer\":\"\",\"referrermedium\":\"\",\"score\":1,\"tag\":\"\",\"trackingnum\":\"+14045558514\",\"timestamp\":\"2018-02-19T13:41:00.236-05:00\"}";
const DOCS_SIGNATURE = 'UZAHbUdfm3GqL7qzilGozGzWV64=';

beforeEach(() => {
  process.env.CALLRAIL_SIGNING_KEY = SIGNING_KEY;
});

afterEach(() => {
  delete process.env.CALLRAIL_TIMESTAMP_TOLERANCE_SECONDS;
});

// Sign like CallRail: base64(HMAC-SHA1(signingKey, rawBody))
function sign(body: string, key = SIGNING_KEY): string {
  return crypto.createHmac('sha1', key).update(body).digest('base64');
}

function makeRequest(body: string, signature?: string, query = ''): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature) headers['Signature'] = signature;
  return new Request(`http://localhost/webhooks/callrail${query}`, {
    method: 'POST',
    headers,
    body,
  }) as unknown as NextRequest;
}

const TEXT_RECEIVED = {
  id: 879204976,
  resource_id: 'SCI0c14896tw1b64fb970ab62aaf4fbefd9',
  source_number: '770-555-5555',
  destination_number: '770-123-4567',
  content: 'CallRail is the best! ',
  message_type: 'sms',
  media_urls: [],
  timestamp: '2017-10-23T15:57:18.826-04:00',
  lead_status: null,
  conversation_id: 'crpLH',
  company_resource_id: 'COM834847e9f4bb4f9h8ll29eb173fe658e',
  person_resource_id: 'PERb122rc301ec45f5yy021d4jj180c1a79',
};

describe('verifyCallRailSignature', () => {
  it('reproduces the docs test vector', () => {
    expect(sign(DOCS_BODY)).toBe(DOCS_SIGNATURE);
    expect(verifyCallRailSignature(DOCS_BODY, DOCS_SIGNATURE, SIGNING_KEY)).toBe(true);
  });

  it('rejects a wrong key, tampered body, and missing inputs', () => {
    expect(verifyCallRailSignature(DOCS_BODY, DOCS_SIGNATURE, 'wrong-key')).toBe(false);
    expect(verifyCallRailSignature(DOCS_BODY + ' ', DOCS_SIGNATURE, SIGNING_KEY)).toBe(false);
    expect(verifyCallRailSignature(DOCS_BODY, null, SIGNING_KEY)).toBe(false);
    expect(verifyCallRailSignature(DOCS_BODY, DOCS_SIGNATURE, undefined)).toBe(false);
  });

  it('returns false (not throws) on a length mismatch', () => {
    expect(verifyCallRailSignature(DOCS_BODY, 'short', SIGNING_KEY)).toBe(false);
  });
});

describe('isTimestampFresh', () => {
  const now = Date.parse('2018-02-19T13:50:00.000-05:00');

  it('is disabled when tolerance is 0', () => {
    expect(isTimestampFresh({ timestamp: '2001-01-01T00:00:00Z' }, 0, now)).toBe(true);
  });

  it('accepts recent and rejects old timestamps', () => {
    const payload = { timestamp: '2018-02-19T13:41:00.236-05:00' };
    expect(isTimestampFresh(payload, 3600, now)).toBe(true);
    expect(isTimestampFresh(payload, 60, now)).toBe(false);
  });

  it('uses submitted_at for form submissions and rejects a missing timestamp', () => {
    expect(isTimestampFresh({ submitted_at: '2018-02-19T13:41:00.000-05:00' }, 3600, now)).toBe(true);
    expect(isTimestampFresh({}, 3600, now)).toBe(false);
  });
});

describe('classifyCallRailEvent', () => {
  it('honors a known callrail_event hint', () => {
    expect(classifyCallRailEvent({ call_type: 'x' }, 'post_call')).toBe('post_call');
  });

  it('infers events from the payload shape', () => {
    expect(classifyCallRailEvent(TEXT_RECEIVED)).toBe('sms_received');
    expect(classifyCallRailEvent({ ...TEXT_RECEIVED, agent: 'Keith Rail' })).toBe('sms_sent');
    expect(classifyCallRailEvent({ form_data: {} })).toBe('form_captured');
    expect(classifyCallRailEvent({ call_type: 'voicemail', changes: ['note'] })).toBe('updated_call');
    expect(classifyCallRailEvent({ call_type: 'x', direction: 'outbound', changes: ['tags'] })).toBe('updated_outbound_call');
    expect(classifyCallRailEvent({ call_type: 'x', direction: 'outbound' })).toBe('post_outbound_call');
    expect(classifyCallRailEvent(JSON.parse(DOCS_BODY))).toBe('call');
    expect(
      classifyCallRailEvent({ answers: [], last_interaction_resource_id: 'CAL1', person_resource_id: 'PER1' })
    ).toBe('convert_assist_complete');
  });
});

describe('POST /webhooks/callrail', () => {
  it('accepts the docs test vector with a valid signature', async () => {
    const res = await POST(makeRequest(DOCS_BODY, DOCS_SIGNATURE, '?callrail_event=post_call'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event: 'post_call' });
  });

  it('accepts a text message and classifies it without a hint', async () => {
    const body = JSON.stringify(TEXT_RECEIVED);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect((await res.json()).event).toBe('sms_received');
  });

  it('rejects a missing Signature header', async () => {
    const res = await POST(makeRequest(DOCS_BODY));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(makeRequest(DOCS_BODY, sign(DOCS_BODY, 'another-key')));
    expect(res.status).toBe(400);
  });

  it('rejects a signed but malformed JSON body', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
  });

  it('enforces the optional timestamp tolerance', async () => {
    process.env.CALLRAIL_TIMESTAMP_TOLERANCE_SECONDS = '600';
    // The docs vector is from 2018, so it is outside a 10 minute window
    const stale = await POST(makeRequest(DOCS_BODY, DOCS_SIGNATURE));
    expect(stale.status).toBe(400);

    const fresh = JSON.stringify({ ...TEXT_RECEIVED, timestamp: new Date().toISOString() });
    const ok = await POST(makeRequest(fresh, sign(fresh)));
    expect(ok.status).toBe(200);
  });

  it('returns 500 when the signing key is not configured', async () => {
    delete process.env.CALLRAIL_SIGNING_KEY;
    const res = await POST(makeRequest(DOCS_BODY, DOCS_SIGNATURE));
    expect(res.status).toBe(500);
  });
});
