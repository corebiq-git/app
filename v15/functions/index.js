const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { GoogleAuth } = require('google-auth-library');

initializeApp();

const monitoringAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/monitoring.read']
});
const projectId = process.env.GCLOUD_PROJECT;
const databaseId = '(default)';
const timezone = 'America/Los_Angeles';
const freeTier = {
  reads: 50000,
  writes: 20000,
  deletes: 20000,
  storageBytes: 1024 ** 3
};
const metrics = {
  reads: 'firestore.googleapis.com/document/read_ops_count',
  writes: 'firestore.googleapis.com/document/write_ops_count',
  deletes: 'firestore.googleapis.com/document/delete_ops_count',
  storageBytes: 'firestore.googleapis.com/storage/total_bytes'
};

function pacificDateKey(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function getLastDateKeys(count, lastDateKey) {
  const [year, month, day] = lastDateKey.split('-').map(Number);
  const keys = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    keys.push(new Date(Date.UTC(year, month - 1, day - offset)).toISOString().slice(0, 10));
  }
  return keys;
}

function numberValue(value) {
  const numeric = Number(value?.int64Value ?? value?.doubleValue ?? value?.intValue ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function queryMetric(metricType, aligner, reducer, startTime, endTime) {
  const client = await monitoringAuth.getClient();
  const filter = [
    `metric.type = "${metricType}"`,
    'resource.type = "firestore_instance"',
    `resource.labels.database_id = "${databaseId}"`
  ].join(' AND ');
  const url = new URL(
    `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries`
  );
  url.searchParams.set('filter', filter);
  url.searchParams.set('interval.startTime', startTime.toISOString());
  url.searchParams.set('interval.endTime', endTime.toISOString());
  url.searchParams.set('aggregation.alignmentPeriod', '3600s');
  url.searchParams.set('aggregation.perSeriesAligner', aligner);
  url.searchParams.set('aggregation.crossSeriesReducer', reducer);

  const response = await client.request({ url: url.toString() });
  return response.data.timeSeries || [];
}

function aggregateDailyValues(series, days, mode) {
  const values = Object.fromEntries(days.map(day => [day, 0]));
  let latest = { time: 0, value: 0 };

  for (const timeSeries of series) {
    for (const point of timeSeries.points || []) {
      const endTime = new Date(point.interval?.endTime || point.interval?.startTime || 0);
      if (!Number.isFinite(endTime.getTime())) continue;
      const day = pacificDateKey(endTime);
      if (!(day in values)) continue;
      const value = numberValue(point.value);

      if (mode === 'max') values[day] = Math.max(values[day], value);
      else values[day] += value;

      if (endTime.getTime() > latest.time) latest = { time: endTime.getTime(), value };
    }
  }

  return { values, latest: latest.value };
}

exports.getFirestoreUsage = onCall({ region: 'us-central1' }, async request => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in with an administrator account to view usage.');
  }

  const email = request.auth.token.email;
  if (typeof email !== 'string' || !email.trim()) {
    throw new HttpsError('permission-denied', 'An administrator email is required.');
  }

  const userSnapshot = await getFirestore().doc(`users/${email.toLowerCase()}`).get();
  if (!userSnapshot.exists || userSnapshot.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Firestore usage is available to administrators only.');
  }

  if (!projectId) {
    throw new HttpsError('failed-precondition', 'The Cloud Functions project is not configured.');
  }

  const now = new Date();
  const today = pacificDateKey(now);
  const days = getLastDateKeys(14, today);
  const startTime = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

  try {
    const [readSeries, writeSeries, deleteSeries, storageSeries] = await Promise.all([
      queryMetric(metrics.reads, 'ALIGN_SUM', 'REDUCE_SUM', startTime, now),
      queryMetric(metrics.writes, 'ALIGN_SUM', 'REDUCE_SUM', startTime, now),
      queryMetric(metrics.deletes, 'ALIGN_SUM', 'REDUCE_SUM', startTime, now),
      queryMetric(metrics.storageBytes, 'ALIGN_MAX', 'REDUCE_MAX', startTime, now)
    ]);
    const reads = aggregateDailyValues(readSeries, days, 'sum');
    const writes = aggregateDailyValues(writeSeries, days, 'sum');
    const deletes = aggregateDailyValues(deleteSeries, days, 'sum');
    const storage = aggregateDailyValues(storageSeries, days, 'max');
    const daily = days.map(date => ({
      date,
      reads: reads.values[date],
      writes: writes.values[date],
      deletes: deletes.values[date],
      storageBytes: storage.values[date]
    }));
    const todayUsage = daily.find(day => day.date === today);

    return {
      databaseId,
      timezone,
      lastUpdated: now.toISOString(),
      quotas: freeTier,
      current: {
        ...todayUsage,
        storageBytes: storage.latest || todayUsage.storageBytes
      },
      daily
    };
  } catch (error) {
    logger.error('Unable to retrieve Firestore usage from Cloud Monitoring.', error);
    const status = error?.response?.status;
    const message = status === 403
      ? 'Cloud Monitoring access is not configured. Enable the Cloud Monitoring API and grant the function service account Monitoring Viewer.'
      : 'Cloud Monitoring usage metrics could not be loaded. Confirm the Monitoring API is enabled and try again.';
    throw new HttpsError('failed-precondition', message);
  }
});
