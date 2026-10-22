import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyPilgrimSecret, POST } from '../app/webhooks/foursquare/route';

const SECRET = 'test_pilgrim_secret_abc123';

beforeEach(() => {
  process.env.FOURSQUARE_PILGRIM_SECRET = SECRET;
});

function makeRequest(body: unknown, secret?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (secret) headers['Pilgrim-Secret'] = secret;
  return new NextRequest('http://localhost:3000/webhooks/foursquare', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const arrivalEvent = {
  pilgrimVisitId: '4c4763f7646e38002cc51789',
  eventType: 'placeArrival',
  timestamp: 1548182419000,
  placeEvent: {
    venues: [{ id: '52af211911d2aa9d4a1f0e0a', name: 'Foursquare Chicago', probability: 0.33 }],
    confidence: 'high',
    locationType: 'venue',
    arrivalTime: 1548182419000,
  },
  lat: 41.889303,
  lng: -87.628898,
  installId: 'CB25EFFB-C2B2-4E0F-B0E9-55C05BEFA4D4',
  sdkType: 'iossdk',
  sdkBuild: '2.4.2',
};

const geofenceEvent = {
  eventType: 'geofenceEnter',
  timestamp: 1548182419000,
  geofenceEvent: { eventType: 'geofenceEnter', radius: 100, geofenceId: 'gf-123' },
  lat: 41.889303,
  lng: -87.628898,
  installId: 'CB25EFFB-C2B2-4E0F-B0E9-55C05BEFA4D4',
  sdkType: 'androidsdk',
  sdkBuild: '2.4.2',
};

describe('verifyPilgrimSecret', () => {
  it('accepts the matching secret', () => {
    expect(verifyPilgrimSecret(SECRET, SECRET)).toBe(true);
  });

  it('rejects a wrong secret, including one of a different length', () => {
    expect(verifyPilgrimSecret('wrong', SECRET)).toBe(false);
    expect(verifyPilgrimSecret(SECRET + 'extra', SECRET)).toBe(false);
  });

  it('rejects a missing header or missing configured secret', () => {
    expect(verifyPilgrimSecret(null, SECRET)).toBe(false);
    expect(verifyPilgrimSecret(SECRET, undefined)).toBe(false);
  });
});

describe('POST /webhooks/foursquare', () => {
  it('returns 401 when the Pilgrim-Secret header is missing', async () => {
    const res = await POST(makeRequest(arrivalEvent));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong Pilgrim-Secret', async () => {
    const res = await POST(makeRequest(arrivalEvent, 'wrong'));
    expect(res.status).toBe(401);
  });

  it('returns 200 for a valid Pilgrim-Secret', async () => {
    const res = await POST(makeRequest(arrivalEvent, SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const res = await POST(makeRequest(arrivalEvent, SECRET, 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 500 when the secret is not configured (fails closed)', async () => {
    delete process.env.FOURSQUARE_PILGRIM_SECRET;
    const res = await POST(makeRequest(arrivalEvent, SECRET));
    expect(res.status).toBe(500);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await POST(makeRequest('{not json', SECRET));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-object payload', async () => {
    const res = await POST(makeRequest(['not-an-event'], SECRET));
    expect(res.status).toBe(400);
  });

  it('handles visit, geofence and journey events', async () => {
    const events = [
      arrivalEvent,
      { ...arrivalEvent, eventType: 'placeDeparture' },
      { ...arrivalEvent, eventType: 'placeHistorical' },
      geofenceEvent,
      { ...geofenceEvent, eventType: 'geofenceDwell' },
      { ...geofenceEvent, eventType: 'geofencePresence' },
      { ...geofenceEvent, eventType: 'geofenceExit' },
      { journeyId: 'j-1', eventType: 'journeysInProgress' },
      { journeyId: 'j-1', eventType: 'journeysApproaching' },
      { journeyId: 'j-1', eventType: 'journeysArrived' },
      { journeyId: 'j-1', eventType: 'journeysCompleted' },
      { journeyId: 'j-1', eventType: 'journeysCanceled' },
      { eventType: 'some_future_event' },
    ];
    for (const event of events) {
      const res = await POST(makeRequest(event, SECRET));
      expect(res.status).toBe(200);
    }
  });
});
