// test-alerts.js
// Manual verification script: runs all four alert data-fetchers against
// real MettaX data and prints both the raw aggregated data and the final
// message text, without going through cron or sending anything on
// WhatsApp. Re-run this any time after touching lib/scheduler.js or
// lib/formatters.js. `node test-alerts.js`.

const scheduler = require('./lib/scheduler');
const formatters = require('./lib/formatters');

function mytParts(date) {
  return {
    date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' }),
    time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }),
  };
}

function mytTime24(date) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kuala_Lumpur' });
}

async function main() {
  const now = new Date();
  const periodStart = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const toMettaxUtc = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

  console.log('========== 1. DAILY ALERT ==========');
  const customers = await scheduler.fetchDailyAlertData(toMettaxUtc(periodStart), toMettaxUtc(now));
  console.log('raw customers:', JSON.stringify(customers, null, 2));
  const { date, time } = mytParts(now);
  console.log('---text---');
  console.log(formatters.formatDailyAlert({
    date, time,
    periodStart: mytTime24(periodStart),
    periodEnd: mytTime24(now),
    customers,
  }));

  console.log('\n========== 2. COMMUNICATION LOST ==========');
  const commLost = await scheduler.fetchOfflineDevices(12 * 60);
  console.log('raw offline (12h+):', JSON.stringify(commLost, null, 2));
  const byCustomer = new Map();
  for (const d of commLost) {
    if (!byCustomer.has(d.customerName)) byCustomer.set(d.customerName, []);
    byCustomer.get(d.customerName).push(d);
  }
  const commCustomers = [...byCustomer.entries()].map(([name, ds]) => ({ name, devices: ds }));
  console.log('---text---');
  console.log(formatters.formatCommunicationLost({ date, time, customers: commCustomers }) || '(null — nothing offline, sends nothing)');

  console.log('\n========== 3. BERKAT SATU HOURLY (all tenants) ==========');
  const berkatOffline = await scheduler.fetchOfflineDevices(60);
  console.log('raw offline (60min+, all tenants):', JSON.stringify(berkatOffline, null, 2));
  const berkatByCustomer = new Map();
  for (const d of berkatOffline) {
    if (!berkatByCustomer.has(d.customerName)) berkatByCustomer.set(d.customerName, []);
    berkatByCustomer.get(d.customerName).push(d);
  }
  if (berkatByCustomer.size === 0) {
    console.log('(nothing offline for any tenant — aborts silently)');
  } else {
    for (const [customerName, devices] of berkatByCustomer) {
      console.log(`---text (${customerName})---`);
      console.log(formatters.formatBerkatSatuHourly({ customerName, date, time, devices }));
    }
  }

  console.log('\n========== 4. MOTION OFFLINE ALERT ==========');
  const incidents = await scheduler.fetchMotionOfflineIncidents();
  console.log('raw new incidents:', JSON.stringify(incidents, null, 2));
  console.log('---text (one per vehicle)---');
  formatters.formatMotionOfflineAlerts(incidents).forEach((m, i) => {
    console.log(`--- message ${i + 1} ---`);
    console.log(m);
  });
  if (incidents.length === 0) console.log('(no motion-offline incidents right now)');
}

main().catch((e) => { console.error(e); process.exit(1); });
