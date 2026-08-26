// src/lib/constants.js
export const ALERT_TYPES = [
  { key: 'daily_alert', label: 'Daily Alert' },
  { key: 'communication_lost', label: 'Comm. Lost' },
  { key: 'berkat_satu_hourly', label: 'Berkat Satu' },
  { key: 'motion_offline', label: 'Motion Offline' },
];

export const TYPE_LABELS = Object.fromEntries(ALERT_TYPES.map((t) => [t.key, t.label]));

export function formatMyt(isoString) {
  const d = new Date(isoString + 'Z');
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kuala_Lumpur',
  });
}
