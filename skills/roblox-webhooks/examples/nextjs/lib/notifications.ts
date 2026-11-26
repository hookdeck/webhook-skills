// Generated with: roblox-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Acknowledge first, process later. Roblox needs a 2xx within 5 seconds and
// gives up on the URL after 5 failed attempts. The Set and queue below keep the
// example self-contained: in production use a database unique constraint (or
// Redis SET NX with a TTL) and a durable queue (SQS, BullMQ, Cloud Tasks...).

// Every payload shares this envelope. Note the PascalCase field names.
export interface RobloxNotification {
  NotificationId: string;
  EventType: string;
  EventTime: string;
  EventPayload?: Record<string, unknown>;
}

export interface ErasureJob {
  type: 'erase-user';
  notificationId: string;
  userId: number;
  gameIds: number[];
}

// NotificationId: "If the same NotificationId is received twice, it is considered a duplicate."
export const seenNotificationIds = new Set<string>();

export const jobQueue = {
  enqueue(job: ErasureJob) {
    setImmediate(() => {
      processJob(job).catch((err) => console.error(`Job ${job.type} failed:`, err));
    });
  },
};

// Map each start place ID in GameIds to the data store entries that hold that
// user's data. Empty by default, so the example deletes nothing.
type ErasureTarget = {
  universeId: number;
  entries: { datastoreName: string; scope: string; entryKey: string }[];
};
const ERASURE_TARGETS: Record<number, ErasureTarget> = {
  // 111111111: { universeId: 222222222, entries: [{ datastoreName: 'PlayerData', scope: 'global', entryKey: 'Player_{userId}' }] },
};

async function deleteStandardDataStoreEntry(
  universeId: number,
  entry: { datastoreName: string; scope: string; entryKey: string }
) {
  // Open Cloud Data Stores API. ROBLOX_OPEN_CLOUD_API_KEY is an Open Cloud API
  // key with the data stores "Delete Entry" permission: a different credential
  // from the webhook secret.
  const url = new URL(
    `https://apis.roblox.com/datastores/v1/universes/${universeId}/standard-datastores/datastore/entries/entry`
  );
  url.search = new URLSearchParams(entry).toString();
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'x-api-key': process.env.ROBLOX_OPEN_CLOUD_API_KEY ?? '' },
  });
  // 404 means there was nothing to delete, which also satisfies the request.
  if (!res.ok && res.status !== 404) throw new Error(`Data store delete failed: ${res.status}`);
}

async function processJob(job: ErasureJob) {
  for (const startPlaceId of job.gameIds) {
    const target = ERASURE_TARGETS[startPlaceId];
    if (!target) continue;
    for (const entry of target.entries) {
      await deleteStandardDataStoreEntry(target.universeId, {
        ...entry,
        entryKey: entry.entryKey.replace('{userId}', String(job.userId)),
      });
    }
  }
  // Record completion (who, which games, when) in your compliance log here.
  console.log(`Erasure complete for notification ${job.notificationId}`);
}

/**
 * Route on EventType. Only RightToErasureRequest, SampleNotification and
 * AnalyticsAlert have published wire values. Roblox doesn't publish the
 * EventType strings for the Subscription, Commerce, Transaction Refunded or
 * Early Harm Detection triggers, so they land in `default`: log the EventType
 * from a real delivery, then add a case for it.
 */
export function handleNotification(notification: RobloxNotification): string {
  const payload = notification.EventPayload ?? {};

  switch (notification.EventType) {
    case 'RightToErasureRequest': {
      // Legal obligation: delete this user's personal data for these games.
      // GameIds are start place IDs. Queue it: never do the deletion inline.
      const gameIds = Array.isArray(payload.GameIds) ? (payload.GameIds as number[]) : [];
      jobQueue.enqueue({
        type: 'erase-user',
        notificationId: notification.NotificationId,
        userId: payload.UserId as number,
        gameIds,
      });
      console.log(`Right to erasure request queued for ${gameIds.length} game(s)`);
      return 'erasure_queued';
    }

    case 'SampleNotification':
      // Sent by the Test Response button in the Creator Dashboard.
      console.log(`Sample notification received (UserId ${payload.UserId})`);
      return 'sample_received';

    case 'AnalyticsAlert': {
      // Analytics alerts: AlertMessage is itself a JSON string.
      let alert: { summary?: string } = {};
      try {
        alert = JSON.parse(String(payload.AlertMessage ?? '{}'));
      } catch {
        // The notification is authentic even if the inner message isn't JSON.
      }
      console.log(`Analytics alert for ${payload.TargetType} ${payload.TargetId}: ${alert.summary ?? '(no summary)'}`);
      return 'alert_received';
    }

    default:
      // Includes the Subscription, Commerce, Transaction Refunded and Early Harm
      // Detection triggers, whose wire names Roblox doesn't publish. Return 2xx
      // so Roblox doesn't retry and eventually disable the URL. For Commerce
      // Product Order Paid, also dedupe on the commerce order ID (Roblox warns
      // that duplicates are possible).
      console.log(
        `Unhandled EventType "${notification.EventType}" (EventPayload keys: ${Object.keys(payload).join(', ')})`
      );
      return 'unhandled';
  }
}
