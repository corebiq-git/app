const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { MetricServiceClient } = require('@google-cloud/monitoring');

admin.initializeApp();
const db = admin.firestore();
const projectParam = defineString('MONITORING_PROJECT_ID', { default: '' });
const adminEmailsParam = defineString('COREBIQ_ADMIN_EMAILS', { default: '' });
const metricClient = new MetricServiceClient();

// Each metric is queried independently. Unsupported metrics are reported as unavailable,
// not silently replaced with guessed values. Check the Google Cloud metrics explorer for your project.
const METRICS = [
  { key: 'firestoreReads', service: 'Cloud Firestore', metric: 'firestore.googleapis.com/document/read_ops_count', label: 'Document reads', unit: 'count' },
  { key: 'firestoreWrites', service: 'Cloud Firestore', metric: 'firestore.googleapis.com/document/write_ops_count', label: 'Document writes', unit: 'count' },
  { key: 'firestoreDeletes', service: 'Cloud Firestore', metric: 'firestore.googleapis.com/document/delete_ops_count', label: 'Document deletes', unit: 'count' },
  { key: 'rtdbEgress', service: 'Realtime Database', metric: 'firebasedatabase.googleapis.com/network/sent_payload_bytes_count', label: 'Payload bytes sent', unit: 'bytes' },
  { key: 'rtdbStorage', service: 'Realtime Database', metric: 'firebasedatabase.googleapis.com/storage/total_bytes', label: 'Stored bytes', unit: 'bytes', gauge: true },
  { key: 'functionExecutions', service: 'Cloud Functions', metric: 'cloudfunctions.googleapis.com/function/execution_count', label: 'Function executions', unit: 'count' },
  { key: 'storageBytes', service: 'Cloud Storage', metric: 'storage.googleapis.com/storage/total_bytes', label: 'Stored bytes', unit: 'bytes', gauge: true },
  { key: 'hostingRequests', service: 'Firebase Hosting', metric: 'firebasehosting.googleapis.com/request_count', label: 'Hosting requests', unit: 'count' }
];
function projectId() { return projectParam.value() || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT; }
function admins() { return adminEmailsParam.value().split(',').map(x => x.trim().toLowerCase()).filter(Boolean); }
function requireAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const email = String(request.auth.token.email || '').toLowerCase();
  if (!email || !admins().includes(email)) throw new HttpsError('permission-denied', 'This account is not on the COREBIQ administrator allowlist.');
  return email;
}
function isoDay(d) { return d.toISOString().slice(0, 10); }
function toNumber(point) {
  const v = point?.value || {};
  if (v.int64Value != null) return Number(v.int64Value);
  if (v.doubleValue != null) return Number(v.doubleValue);
  if (v.distributionValue?.count != null) return Number(v.distributionValue.count);
  return null;
}
async function queryMetric(spec, days) {
  const now = new Date(); const start = new Date(now.getTime() - days * 86400000);
  const request = { name: `projects/${projectId()}`, filter: `metric.type = "${spec.metric}"`, interval: { startTime: { seconds: Math.floor(start.getTime()/1000) }, endTime: { seconds: Math.floor(now.getTime()/1000) } }, view: 'FULL', pageSize: 1000 };
  try {
    const [series] = await metricClient.listTimeSeries(request);
    const daily = new Map(); let total = 0; let hasValue = false; let latestTime = 0; let latestGauge = null;
    for (const ts of series || []) for (const p of ts.points || []) {
      const val = toNumber(p); if (val == null) continue;
      const seconds = Number(p.interval?.endTime?.seconds || 0);
      const time = seconds ? new Date(seconds * 1000) : now;
      const day = isoDay(time);
      if (spec.gauge) {
        if (seconds >= latestTime) { latestTime = seconds; latestGauge = val; }
        daily.set(day, val);
      } else {
        daily.set(day, (daily.get(day) || 0) + val); total += val;
      }
      hasValue = true;
    }
    return { ...spec, available: hasValue, value: hasValue ? (spec.gauge ? latestGauge : total) : null, daily: Object.fromEntries(daily), note: hasValue ? '' : 'No time series returned for selected range.' };
  } catch (e) {
    // Do not return internal error details to the browser; logs retain the details.
    console.warn(`Metric query unavailable: ${spec.metric}`, e.message);
    return { ...spec, available: false, value: null, daily: {}, note: 'Metric unavailable or API/permission not configured.' };
  }
}
async function getHistory(days) {
  const snap = await db.collection('firebaseUsageDaily').orderBy('date', 'desc').limit(Math.min(90, days + 5)).get();
  return snap.docs.map(d => d.data());
}
async function buildDashboard(days) {
  const results = await Promise.all(METRICS.map(m => queryMetric(m, days)));
  const byKey = Object.fromEntries(results.map(x => [x.key, x]));
  const dates = Array.from({length: days}, (_,i) => isoDay(new Date(Date.now() - (days - 1 - i)*86400000)));
  const daily = dates.map(date => {
    const o = { date };
    for (const key of ['firestoreReads','firestoreWrites','functionExecutions']) o[key] = byKey[key]?.daily?.[date] ?? null;
    return o;
  });
  const history = await getHistory(days);
  const latest = Object.fromEntries(['firestoreReads','firestoreWrites','rtdbEgress','functionExecutions'].map(k => [k, byKey[k]?.value ?? null]));
  const warningThresholds = { firestoreReads: Number(process.env.WARN_FIRESTORE_READS_DAILY || 0), firestoreWrites: Number(process.env.WARN_FIRESTORE_WRITES_DAILY || 0), functionExecutions: Number(process.env.WARN_FUNCTION_EXECUTIONS_DAILY || 0) };
  const latestDay = daily[daily.length - 1] || {};
  const warnings = Object.entries(warningThresholds).filter(([key, limit]) => limit > 0 && Number(latestDay[key] || 0) >= limit).map(([key, limit]) => `${key} reached configured daily warning threshold (${limit}).`);
  const today = isoDay(new Date());
  const freeTier = {
    reads: byKey.firestoreReads?.daily?.[today] ?? null,
    writes: byKey.firestoreWrites?.daily?.[today] ?? null,
    deletes: byKey.firestoreDeletes?.daily?.[today] ?? null,
    storageBytes: byKey.storageBytes?.value ?? null,
    referenceLimits: { readsPerDay: 50000, writesPerDay: 20000, deletesPerDay: 20000, storageBytes: 1073741824 }
  };
  return { projectId: projectId(), latest, daily, services: results, history, freeTier, billing: { available: false }, warnings, warning: warnings.length ? `Usage warning: ${warnings.join(' ')}` : 'Official metrics can be delayed or unavailable. Free-tier bars are indicative; check Firebase Console for plan eligibility and billing details.' };
}
exports.checkAdminAccess = onCall({ region: 'us-central1', cors: true, enforceAppCheck: false }, async request => {
  const email = requireAdmin(request);
  return { ok: true, email };
});

exports.getDashboard = onCall({ region: 'us-central1', cors: true, enforceAppCheck: false }, async request => {
  requireAdmin(request);
  const days = Math.max(1, Math.min(30, Number(request.data?.days) || 7));
  return buildDashboard(days);
});
exports.captureDailySnapshot = onCall({ region: 'us-central1', cors: true, enforceAppCheck: false }, async request => {
  const email = requireAdmin(request);
  const results = await Promise.all(METRICS.map(m => queryMetric(m, 1)));
  const values = Object.fromEntries(results.map(x => [x.key, x.value]));
  const date = isoDay(new Date());
  const doc = { date, ...values, services: results.map(x => ({ service: x.service, metric: x.metric, available: x.available, value: x.value })), capturedAt: new Date().toISOString(), capturedBy: email, projectId: projectId() };
  await db.collection('firebaseUsageDaily').doc(date).set(doc, { merge: true });
  return { ok: true, date };
});
exports.scheduledDailySnapshot = onSchedule({ schedule: 'every day 23:55', timeZone: 'Asia/Kolkata', region: 'us-central1' }, async () => {
  const results = await Promise.all(METRICS.map(m => queryMetric(m, 1)));
  const date = isoDay(new Date());
  const values = Object.fromEntries(results.map(x => [x.key, x.value]));
  await db.collection('firebaseUsageDaily').doc(date).set({ date, ...values, services: results.map(x => ({ service: x.service, metric: x.metric, available: x.available, value: x.value })), capturedAt: new Date().toISOString(), capturedBy: 'scheduled-job', projectId: projectId() }, { merge: true });
});
