// lib/formatters.js
// Builds message text exactly matching the formats in Lorry_System_Automation_Spec.md.
// Each function takes already-fetched/aggregated data and returns a string
// (or an array of strings, for Motion Offline Alert's one-message-per-vehicle rule).

function formatDuration(minutes) {
  if (minutes < 24 * 60) {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs} hrs ${mins} mins`;
  }
  const days = Math.floor(minutes / (24 * 60));
  const hrs = Math.floor((minutes % (24 * 60)) / 60);
  return `${days} Day ${hrs} Hours`;
}

// --- 1. Daily Alert ---
// customers: [{ name, devices: [{ name, alerts: [{ type, count }] }] }]
function formatDailyAlert({ date, time, periodStart, periodEnd, customers }) {
  const total = customers.reduce(
    (sum, c) => sum + c.devices.reduce((s, d) => s + d.alerts.reduce((a, x) => a + x.count, 0), 0),
    0
  );

  if (total === 0) {
    return [
      'LORRY SYSTEM',
      'Daily Alert Summary',
      `${date} | ${time}`,
      '',
      `Period: ${periodStart} \u2013 ${periodEnd}`,
      'Total Alerts: 0',
      '',
      'No alerts recorded. All clear!',
      '',
      'lorrysystem.ai',
    ].join('\n');
  }

  const blocks = customers.map((c) => {
    const customerTotal = c.devices.reduce((s, d) => s + d.alerts.reduce((a, x) => a + x.count, 0), 0);
    const header = `*${c.name} (${customerTotal})*`;
    if (c.devices.length === 0) return header;

    const deviceLines = c.devices.map((d, i) => {
      const sorted = [...d.alerts].sort((a, b) => b.count - a.count);
      const alertLines = sorted.map((a) => `> ${a.type} | ${a.count}`).join('\n');
      return `${i + 1}.${d.name}\n${alertLines}`;
    }).join('\n');

    return `${header}\n${deviceLines}`;
  });

  return [
    'LORRY SYSTEM',
    'Daily Alert Summary',
    `${date} | ${time}`,
    '',
    `Period: ${periodStart} \u2013 ${periodEnd}`,
    `Total Alerts: ${total}`,
    '',
    blocks.join('\n\n'),
    '',
    'lorrysystem.ai',
  ].join('\n');
}

// --- 2. Communication Lost ---
// customers: [{ name, devices: [{ name, offlineMinutes }] }]
// Returns null if nothing is offline (spec: send nothing at all).
function formatCommunicationLost({ date, time, customers }) {
  const withOffline = customers.filter((c) => c.devices.length > 0).sort((a, b) => a.name.localeCompare(b.name));
  if (withOffline.length === 0) return null;

  const blocks = withOffline.map((c) => {
    const deviceLines = c.devices.map((d, i) => `${i + 1}.${d.name}\n> Last active ${formatDuration(d.offlineMinutes)}`).join('\n');
    return `*${c.name}*\n${deviceLines}`;
  });

  return [
    'LORRY SYSTEM',
    'Communication Lost Summary',
    `${date} | ${time}`,
    '',
    blocks.join('\n\n'),
    '',
    'lorrysystem.ai',
  ].join('\n');
}

// --- 3. Berkat Satu Hourly (single customer) ---
// devices: [{ name, offlineMinutes }] — already filtered to >= 60 min offline
// Returns null on empty result or failed check (spec: abort silently).
function formatBerkatSatuHourly({ customerName, date, time, devices }) {
  if (!devices || devices.length === 0) return null;

  const sorted = [...devices].sort((a, b) => b.offlineMinutes - a.offlineMinutes);
  const lines = sorted.map((d, i) => `${i + 1}.${d.name} | Last active ${formatDuration(d.offlineMinutes)}`).join('\n');

  return [
    `MERCURY/ ${customerName}`,
    'Vehicle Activity Status',
    `${date} | ${time}`,
    `Offline / ACC OFF (${devices.length}):`,
    '',
    lines,
    '',
    `These vehicles have remained in ACC OFF status for the duration shown as of ${time}`,
    'lorrysystem.ai',
  ].join('\n');
}

// --- 4. Motion Offline Alert (one message PER vehicle) ---
// incidents: [{ deviceName, address, acc, speed, lastUpdate }]
// Returns an array of message strings, one per incident.
function formatMotionOfflineAlerts(incidents) {
  return incidents.map((v) => [
    '\u{1F6A8} VEHICLE OFFLINE ALERT',
    '',
    `*Vehicle* : ${v.deviceName}`,
    `*Last Location:* ${v.address}`,
    `*ACC* : ${v.acc ? 'ON' : 'OFF'}`,
    `*Last Speed:* ${v.speed} km/h`,
    `*Last Update:* ${v.lastUpdate}`,
    '',
    '\u26A0\uFE0F Device went offline while the vehicle was in motion.',
  ].join('\n'));
}

module.exports = {
  formatDuration,
  formatDailyAlert,
  formatCommunicationLost,
  formatBerkatSatuHourly,
  formatMotionOfflineAlerts,
};
