const request = require('supertest');

// Set test environment variables before importing the app
process.env.FOURSQUARE_PILGRIM_SECRET = 'test_pilgrim_secret_abc123';

const { app, verifyPilgrimSecret } = require('../src/index');

const SECRET = process.env.FOURSQUARE_PILGRIM_SECRET;

const arrivalEvent = {
  pilgrimVisitId: '4c4763f7646e38002cc51789',
  eventType: 'placeArrival',
  timestamp: 1548182419000,
  placeEvent: {
    venues: [
      {
        id: '52af211911d2aa9d4a1f0e0a',
        name: 'Foursquare Chicago',
        location: { city: 'Chicago', state: 'IL', country: 'US', lat: 41.889264, lng: -87.628911 },
        categories: [{ id: '4bf58dd8d48988d125941735', name: 'Tech Startup' }],
        probability: 0.33,
      },
    ],
    confidence: 'high',
    locationType: 'venue',
    arrivalTime: 1548182419000,
  },
  lat: 41.889303,
  lng: -87.628898,
  user: { userId: 'CB25EFFB-C2B2-4E0F-B0E9-55C05BEFA4D4' },
  installId: 'CB25EFFB-C2B2-4E0F-B0E9-55C05BEFA4D4',
  sdkType: 'iossdk',
  sdkBuild: '2.4.2',
};

const geofenceEvent = {
  eventType: 'geofenceEnter',
  timestamp: 1548182419000,
  geofenceEvent: {
    eventType: 'geofenceEnter',
    eventLat: 41.889303,
    eventLng: -87.628898,
    radius: 100,
    geofenceId: 'gf-123',
  },
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

  it('rejects a wrong secret', () => {
    expect(verifyPilgrimSecret('wrong', SECRET)).toBe(false);
  });

  it('rejects a secret of a different length without throwing', () => {
    expect(verifyPilgrimSecret(SECRET + 'extra', SECRET)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyPilgrimSecret(undefined, SECRET)).toBe(false);
  });

  it('rejects when no secret is configured', () => {
    expect(verifyPilgrimSecret(SECRET, undefined)).toBe(false);
  });
});

describe('POST /webhooks/foursquare', () => {
  it('returns 401 when the Pilgrim-Secret header is missing', async () => {
    const res = await request(app).post('/webhooks/foursquare').send(arrivalEvent);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong Pilgrim-Secret', async () => {
    const res = await request(app)
      .post('/webhooks/foursquare')
      .set('Pilgrim-Secret', 'wrong')
      .send(arrivalEvent);
    expect(res.status).toBe(401);
  });

  it('returns 200 for a valid Pilgrim-Secret', async () => {
    const res = await request(app)
      .post('/webhooks/foursquare')
      .set('Pilgrim-Secret', SECRET)
      .send(arrivalEvent);
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('verifies regardless of content type', async () => {
    const res = await request(app)
      .post('/webhooks/foursquare')
      .set('Pilgrim-Secret', SECRET)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(arrivalEvent));
    expect(res.status).toBe(200);
  });

  it('returns 500 when the secret is not configured (fails closed)', async () => {
    const saved = process.env.FOURSQUARE_PILGRIM_SECRET;
    delete process.env.FOURSQUARE_PILGRIM_SECRET;
    try {
      const res = await request(app)
        .post('/webhooks/foursquare')
        .set('Pilgrim-Secret', SECRET)
        .send(arrivalEvent);
      expect(res.status).toBe(500);
    } finally {
      process.env.FOURSQUARE_PILGRIM_SECRET = saved;
    }
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await request(app)
      .post('/webhooks/foursquare')
      .set('Pilgrim-Secret', SECRET)
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-object payload', async () => {
    const res = await request(app)
      .post('/webhooks/foursquare')
      .set('Pilgrim-Secret', SECRET)
      .send(['not-an-event']);
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
      const res = await request(app)
        .post('/webhooks/foursquare')
        .set('Pilgrim-Secret', SECRET)
        .send(event);
      expect(res.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
