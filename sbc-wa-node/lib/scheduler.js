// lib/scheduler.js
// Cron jobs matching the exact schedules in Lorry_System_Automation_Spec.md.
// All times are interpreted in Asia/Kuala_Lumpur (MYT) regardless of the
// server's own system timezone, per the spec's note that the server runs UTC.

const cron = require('node-cron');
const config = require('../config');
const mettax = require('./mettax-client');
const geocoding = require('./geocoding');
const tripTrack = require('./trip-track');
const {
  formatDailyAlert,
  formatCommunicationLost,
  formatBerkatSatuHourly,
  formatMotionOfflineAlerts,
} = require('./formatters');

const TZ = 'Asia/Kuala_Lumpur';

// Tracks vehicles currently in an active "motion offline" incident, so we
// alert once and stay silent until it clears (per spec's dedup rule).
const activeMotionIncidents = new Set();

// MettaX's alarmType values are internal short codes, not the human labels
// in the spec, and don't reliably follow a camelCase-of-the-label pattern
// (e.g. "Memory Malfunction" is actually "mainMemoryFault", not
// "memoryMalfunction"). Verification pass (2026-08-24): swept the fleet's
// entire alarm history (~10 months, back to the earliest device creation
// date; the most recent 30-day window alone had 210,190 records) and found
// 24 distinct real alarmType values. Against the spec's 13 tracked types:
//
//   CONFIRMED (exact string seen in real data):
//     outage -> Device power outage
//     videoSignalLost -> Camera Signal Loss
//     gpsBlindZone -> Gps Blind Zone
//     mainMemoryFault -> Memory Malfunction  (NOT "memoryMalfunction" — that
//       guess was wrong and never appears)
//
//   PLAUSIBLE, NOT CERTAIN:
//     occlusion (432 occurrences) -> mapped here to Camera Obstructed on
//       semantic grounds (occlusion = view blocked). This was never one of
//       my literal guesses; "cameraObstructed" never appeared once.
//
//   STILL UNCONFIRMED — never seen once across the full sweep, so these
//   remain unverified best-effort guesses. Either they're worded
//   differently than guessed, or these fault types genuinely haven't
//   occurred on this fleet yet:
//     Crash, SOS Alert, Device Disassembly, Low Ext Power,
//     Low internal power, Low power protection,
//     Disaster recovery storage failure, Data Threshold Alert
//
// Any alarmType this map doesn't recognize is logged via console.warn (see
// trackedLabelFor below) so a real occurrence of one of the 8 unconfirmed
// types — under a name different from the guess below — will surface
// instead of silently undercounting.
const TRACKED_ALARM_TYPES = {
  crash: 'Crash', // unconfirmed
  sos: 'SOS Alert', // unconfirmed
  deviceDisassembly: 'Device Disassembly', // unconfirmed
  outage: 'Device power outage', // confirmed
  occlusion: 'Camera Obstructed', // plausible, not certain
  videoSignalLost: 'Camera Signal Loss', // confirmed
  gpsBlindZone: 'Gps Blind Zone', // confirmed
  lowExtPower: 'Low Ext Power', // unconfirmed
  lowInternalPower: 'Low internal power', // unconfirmed
  lowPowerProtection: 'Low power protection', // unconfirmed
  mainMemoryFault: 'Memory Malfunction', // confirmed
  disasterRecoveryStorageFailure: 'Disaster recovery storage failure', // unconfirmed
  dataThresholdAlert: 'Data Threshold Alert', // unconfirmed
};

// One-time-per-type warning so unrecognized alarmTypes are visible in logs
// without spamming on every single record.
const warnedUnknownTypes = new Set();
function trackedLabelFor(alarmType) {
  const label = TRACKED_ALARM_TYPES[alarmType];
  if (!label && !warnedUnknownTypes.has(alarmType)) {
    warnedUnknownTypes.add(alarmType);
    console.warn(`[scheduler] Untracked MettaX alarmType seen (ignored in Daily Alert): ${alarmType}`);
  }
  return label;
}

const excludedCustomersLower = new Set(config.excludedCustomers.map((name) => name.toLowerCase()));

function isExcluded(device) {
  return (
    excludedCustomersLower.has((device.customerName || '').toLowerCase()) ||
    config.excludedDeviceIds.includes(device.id)
  );
}

// Motion Offline Alert only: "Demo Account" falsely triggers on stale demo
// data there, so it's excluded from this alert specifically — unlike Daily
// Alert, Communication Lost, and Berkat Satu Hourly, which still list it.
const MOTION_OFFLINE_EXCLUDED_CUSTOMERS = new Set(['demo account']);

function isMotionOfflineExcluded(device) {
  return isExcluded(device) || MOTION_OFFLINE_EXCLUDED_CUSTOMERS.has((device.customerName || '').toLowerCase());
}

// MettaX timestamps ("YYYY-MM-DD HH:mm:ss") are UTC — confirmed by comparing
// a live device's deviceTime against Date.now() at fetch time.
function parseMettaxUtc(str) {
  return new Date(`${str.replace(' ', 'T')}Z`);
}

function minutesSince(mettaxUtcString) {
  return Math.floor((Date.now() - parseMettaxUtc(mettaxUtcString).getTime()) / 60000);
}

function mytDateParts(date) {
  return {
    date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }),
    time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }),
  };
}

// Daily Alert's "Period: 09:00 – 12:00" line uses 24-hour HH:mm, distinct
// from the 12-hour AM/PM format used everywhere else in these messages.
function mytTime24(date) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
}

// Sends a WhatsApp message with the same typing-indicator behavior as the
// queue worker in app.js, reused here for scheduled group alerts.
async function sendWithTyping(getSock, jid, text) {
  const sock = getSock();
  await sock.sendPresenceUpdate('composing', jid);
  const typingDelay = Math.floor(Math.random() * 3000) + 3000;
  await new Promise((r) => setTimeout(r, typingDelay));
  await sock.sendMessage(jid, { text });
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

// customers: [{ name, devices: [{ name, alerts: [{ type, count }] }] }]
// Every included customer is present even with zero alerts; within a
// customer, only devices with at least one tracked alert are listed.
async function fetchDailyAlertData(periodStartUtc, periodEndUtc) {
  const devices = (await mettax.getDeviceList()).filter((d) => !isExcluded(d));
  if (devices.length === 0) return [];

  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const alarmResult = await mettax.getAlarmPage(periodStartUtc, periodEndUtc, devices.map((d) => d.id));
  const records = alarmResult.records || [];

  // customerName -> deviceId -> { name, counts: Map<label, count> }
  const customerMap = new Map();
  for (const d of devices) {
    if (!customerMap.has(d.customerName)) customerMap.set(d.customerName, new Map());
  }

  for (const rec of records) {
    const device = deviceById.get(rec.deviceId);
    if (!device) continue; // alarm for a device outside our included set
    const label = trackedLabelFor(rec.alarmType);
    if (!label) continue;

    const deviceMap = customerMap.get(device.customerName);
    if (!deviceMap.has(rec.deviceId)) {
      deviceMap.set(rec.deviceId, { name: device.deviceName, counts: new Map() });
    }
    const entry = deviceMap.get(rec.deviceId);
    entry.counts.set(label, (entry.counts.get(label) || 0) + 1);
  }

  return [...customerMap.entries()]
    .map(([customerName, deviceMap]) => ({
      name: customerName,
      devices: [...deviceMap.values()].map((d) => ({
        name: d.name,
        alerts: [...d.counts.entries()].map(([type, count]) => ({ type, count })),
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Returns a flat list of offline devices (only those >= thresholdMinutes),
// each tagged with its customer name so callers can group as needed.
// Devices that have never reported at all (absent from the shadow response,
// or a null deviceTime) are skipped rather than shown as offline — they're
// unactivated/spare units, not part of the monitored fleet.
async function fetchOfflineDevices(thresholdMinutes, customerFilter = null) {
  let devices = (await mettax.getDeviceList()).filter((d) => !isExcluded(d));
  if (customerFilter) devices = devices.filter((d) => d.customerName === customerFilter);
  if (devices.length === 0) return [];

  const shadowData = await mettax.getDeviceShadow(devices.map((d) => d.id));
  const shadowById = new Map(shadowData.map((s) => [s.deviceData.deviceId, s.deviceData]));

  const offline = [];
  for (const device of devices) {
    const dd = shadowById.get(device.id);
    if (!dd || !dd.deviceTime) continue;
    const offlineMinutes = minutesSince(dd.deviceTime);
    if (offlineMinutes >= thresholdMinutes) {
      offline.push({ customerName: device.customerName, name: device.deviceName, offlineMinutes });
    }
  }
  return offline;
}

// incidents: [{ deviceName, address, acc, speed, lastUpdate }] — only NEW
// incidents (not already active) are returned, per the alert-once rule.
async function fetchMotionOfflineIncidents() {
  const devices = (await mettax.getDeviceList()).filter((d) => !isMotionOfflineExcluded(d));
  if (devices.length === 0) return [];

  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const shadowData = await mettax.getDeviceShadow(devices.map((d) => d.id));
  const seenThisRun = new Set();
  const newIncidents = [];

  for (const entry of shadowData) {
    const dd = entry.deviceData;
    if (!dd.deviceTime) continue;

    const offlineMinutes = minutesSince(dd.deviceTime);
    const isMotionOffline = dd.acc === 1 && dd.speed > 1 && offlineMinutes > 30;

    if (isMotionOffline) {
      seenThisRun.add(dd.deviceId);
      if (!activeMotionIncidents.has(dd.deviceId)) {
        activeMotionIncidents.add(dd.deviceId);
        let address;
        try {
          address = dd.lat != null && dd.lon != null
            ? await geocoding.getShortAddress(dd.lat, dd.lon)
            : 'Unknown location';
        } catch (err) {
          console.error(`Geocoding failed for ${dd.deviceName}:`, err);
          address = 'Unknown location';
        }
        const { date, time } = mytDateParts(parseMettaxUtc(dd.deviceTime));
        newIncidents.push({
          deviceName: dd.deviceName,
          customerName: deviceById.get(dd.deviceId)?.customerName || null,
          address,
          acc: dd.acc,
          speed: dd.speed,
          lastUpdate: `${date}, ${time}`,
        });
      }
    }
  }

  // Clear incidents for devices that recovered (no longer match the
  // condition) so a future recurrence is treated as a fresh incident.
  for (const deviceId of activeMotionIncidents) {
    if (!seenThisRun.has(deviceId)) activeMotionIncidents.delete(deviceId);
  }

  return newIncidents;
}

function initScheduler(getSock, db) {
  const logAlert = (alertType, status, messageText = null, error = null, meta = {}) => {
    const { tenant = null, device = null, tenantBreakdown = null } = meta;
    db.prepare(
      'INSERT INTO alert_log (alert_type, status, message_text, error, tenant, device, tenant_breakdown) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(alertType, status, messageText, error, tenant, device, tenantBreakdown ? JSON.stringify(tenantBreakdown) : null);
  };

  // 1. Daily Alert — 9:15am, 12:15pm, 3:15pm, 6:15pm, 9:15pm MYT
  cron.schedule('15 9,12,15,18,21 * * *', async () => {
    try {
      const now = new Date();
      const periodStartDate = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const toMettaxUtc = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
      const customers = await fetchDailyAlertData(toMettaxUtc(periodStartDate), toMettaxUtc(now));
      const { date, time } = mytDateParts(now);
      const text = formatDailyAlert({
        date,
        time,
        periodStart: mytTime24(periodStartDate),
        periodEnd: mytTime24(now),
        customers,
      });
      await sendWithTyping(getSock, config.whatsappGroups.dailyAlert, text);
      const tenantBreakdown = customers.map((c) => ({
        name: c.name,
        count: c.devices.reduce((sum, d) => sum + d.alerts.reduce((a, x) => a + x.count, 0), 0),
      }));
      logAlert('daily_alert', 'SENT', text, null, { tenantBreakdown });
    } catch (err) {
      console.error('Daily Alert failed:', err);
      logAlert('daily_alert', 'FAILED', null, err.message);
    }
  }, { timezone: TZ });

  // 2. Communication Lost — 9:30am, 3:30pm MYT
  cron.schedule('30 9,15 * * *', async () => {
    try {
      const offline = await fetchOfflineDevices(12 * 60);
      if (offline.length === 0) {
        logAlert('communication_lost', 'SKIPPED', null, 'nothing offline 12h+');
        return; // spec: stay completely silent
      }

      const byCustomer = new Map();
      for (const d of offline) {
        if (!byCustomer.has(d.customerName)) byCustomer.set(d.customerName, []);
        byCustomer.get(d.customerName).push(d);
      }
      const customers = [...byCustomer.entries()].map(([name, ds]) => ({ name, devices: ds }));

      const now = new Date();
      const { date, time } = mytDateParts(now);
      const text = formatCommunicationLost({ date, time, customers });
      if (text) {
        await sendWithTyping(getSock, config.whatsappGroups.communicationLost, text);
        const tenantBreakdown = customers.map((c) => ({ name: c.name, count: c.devices.length }));
        logAlert('communication_lost', 'SENT', text, null, { tenantBreakdown });
      }
    } catch (err) {
      console.error('Communication Lost failed:', err);
      logAlert('communication_lost', 'FAILED', null, err.message);
    }
  }, { timezone: TZ });

  // 3. Berkat Satu Hourly — every 3 hours: 6,9,12,15,18,21 MYT.
  // Scoped to exactly one customer (BERKAT SATU TRANSPORT) per the spec.
  cron.schedule('0 6,9,12,15,18,21 * * *', async () => {
    try {
      const offline = await fetchOfflineDevices(60, config.berkatSatuCustomerName);
      if (offline.length === 0) {
        logAlert('berkat_satu_hourly', 'SKIPPED', null, 'nothing offline 60min+');
        return; // abort silently per spec.
      }

      const now = new Date();
      const { date, time } = mytDateParts(now);
      const text = formatBerkatSatuHourly({ customerName: config.berkatSatuCustomerName, date, time, devices: offline });
      await sendWithTyping(getSock, config.whatsappGroups.berkatSatuHourly, text);
      logAlert('berkat_satu_hourly', 'SENT', text, null, {
        tenant: config.berkatSatuCustomerName,
        device: offline.map((d) => d.name).join(', '),
      });
    } catch (err) {
      console.error('Berkat Satu Hourly failed:', err);
      logAlert('berkat_satu_hourly', 'FAILED', null, err.message);
      // spec: abort silently on failure — no message, just log.
    }
  }, { timezone: TZ });

  // 4. Motion Offline Alert — every 1 minute, 24/7. Skips aren't logged here
  // (nothing-to-report is the normal case every minute — logging it would
  // just flood the table); only actual sends/failures are recorded.
  cron.schedule('* * * * *', async () => {
    try {
      const incidents = await fetchMotionOfflineIncidents();
      if (incidents.length === 0) return;
      const messages = formatMotionOfflineAlerts(incidents);
      for (let i = 0; i < incidents.length; i++) {
        await sendWithTyping(getSock, config.whatsappGroups.motionOfflineAlert, messages[i]);
        logAlert('motion_offline', 'SENT', messages[i], null, {
          tenant: incidents[i].customerName,
          device: incidents[i].deviceName,
        });
      }
    } catch (err) {
      console.error('Motion Offline Alert failed:', err);
      logAlert('motion_offline', 'FAILED', null, err.message);
    }
  }, { timezone: TZ });

  // 5. Trip & Track collection — every 3 hours: 9:45, 12:45, 15:45, 18:45,
  // 21:45, 0:45, 3:45, 6:45 MYT. Silent background data collection — no
  // WhatsApp message either way, success or failure (per spec section 2).
  cron.schedule('45 9,12,15,18,21,0,3,6 * * *', async () => {
    try {
      const result = await tripTrack.runCollection(db);
      console.log(`Trip & Track collection: ${result.tripsInserted} trip(s), ${result.staysInserted} stay(s).`);
    } catch (err) {
      console.error('Trip & Track collection failed:', err);
    }
  }, { timezone: TZ });

  console.log(`Scheduler initialized (timezone: ${TZ}). Jobs: Daily Alert, Communication Lost, Berkat Satu Hourly, Motion Offline Alert, Trip & Track.`);
}

module.exports = {
  initScheduler,
  // exported for testing against real data outside the cron schedule
  fetchDailyAlertData,
  fetchOfflineDevices,
  fetchMotionOfflineIncidents,
};
