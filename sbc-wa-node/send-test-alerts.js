// send-test-alerts.js
// Real send test: Daily Alert, Communication Lost, and Berkat Satu Hourly,
// using live MettaX data and the actual sendWithTyping() presence-then-send
// flow, to config.whatsappGroups (all four currently point to the same "LS
// Stuff" group). Motion Offline Alert is intentionally skipped — there is
// no genuine incident right now, and per team decision we do not send a
// fabricated one unmarked into a live group.
//
// Requires a WhatsApp session already paired via app.js (QR-scanned into
// /data/baileys_auth) on whichever host this runs on. `node send-test-alerts.js`.

const { useMultiFileAuthState, makeWASocket, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('./config');
const scheduler = require('./lib/scheduler');
const formatters = require('./lib/formatters');

const logger = pino({ level: 'warn' });
const TZ = 'Asia/Kuala_Lumpur';

function mytParts(date) {
  return {
    date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }),
    time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }),
  };
}
function mytTime24(date) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
}

// Same typing-indicator flow as scheduler.js's sendWithTyping / app.js's queue worker.
async function sendWithTyping(sock, jid, text) {
  await sock.sendPresenceUpdate('composing', jid);
  const typingDelay = Math.floor(Math.random() * 3000) + 3000;
  await new Promise((r) => setTimeout(r, typingDelay));
  await sock.sendMessage(jid, { text });
}

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState('/data/baileys_auth');
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ auth: state, version, logger, syncFullHistory: false });
  sock.ev.on('creds.update', saveCreds);

  return new Promise((resolve, reject) => {
    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
      if (connection === 'open') resolve(sock);
      if (connection === 'close') {
        reject(new Error(
          `WhatsApp connection closed before opening (no paired session in /data/baileys_auth?): ${lastDisconnect?.error?.message}`
        ));
      }
    });
  });
}

async function main() {
  console.log('Connecting to WhatsApp using existing /data/baileys_auth session...');
  const sock = await connect();
  console.log('Connected.');

  const now = new Date();
  const { date, time } = mytParts(now);

  // 1. Daily Alert (3h window ending now)
  const periodStartDate = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const toMettaxUtc = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  const customers = await scheduler.fetchDailyAlertData(toMettaxUtc(periodStartDate), toMettaxUtc(now));
  const dailyAlertText = formatters.formatDailyAlert({
    date, time,
    periodStart: mytTime24(periodStartDate),
    periodEnd: mytTime24(now),
    customers,
  });
  console.log('\n=== Sending Daily Alert ===');
  console.log(dailyAlertText);
  await sendWithTyping(sock, config.whatsappGroups.dailyAlert, dailyAlertText);
  console.log('Daily Alert sent.');

  // 2. Communication Lost (12h+ threshold) — only sends if something's offline
  const commLostOffline = await scheduler.fetchOfflineDevices(12 * 60);
  if (commLostOffline.length === 0) {
    console.log('\n=== Communication Lost: nothing offline 12h+, skipping (matches "stay silent" spec) ===');
  } else {
    const byCustomer = new Map();
    for (const d of commLostOffline) {
      if (!byCustomer.has(d.customerName)) byCustomer.set(d.customerName, []);
      byCustomer.get(d.customerName).push(d);
    }
    const commCustomers = [...byCustomer.entries()].map(([name, ds]) => ({ name, devices: ds }));
    const commLostText = formatters.formatCommunicationLost({ date, time, customers: commCustomers });
    console.log('\n=== Sending Communication Lost ===');
    console.log(commLostText);
    await sendWithTyping(sock, config.whatsappGroups.communicationLost, commLostText);
    console.log('Communication Lost sent.');
  }

  // 3. Berkat Satu Hourly (60min+ threshold, single customer) — only sends if something's offline
  const berkatOffline = await scheduler.fetchOfflineDevices(60, config.berkatSatuCustomerName);
  if (berkatOffline.length === 0) {
    console.log('\n=== Berkat Satu Hourly: nothing offline 60min+, skipping (matches "stay silent" spec) ===');
  } else {
    const berkatText = formatters.formatBerkatSatuHourly({
      customerName: config.berkatSatuCustomerName, date, time, devices: berkatOffline,
    });
    console.log('\n=== Sending Berkat Satu Hourly ===');
    console.log(berkatText);
    await sendWithTyping(sock, config.whatsappGroups.berkatSatuHourly, berkatText);
    console.log('Berkat Satu Hourly sent.');
  }

  // 4. Motion Offline Alert — intentionally skipped per team decision.
  console.log('\n=== Motion Offline Alert: skipped (no real incident right now; not sending a fabricated one) ===');

  console.log('\nDone.');
  process.exit(0);
}

main().catch((e) => { console.error('Send test failed:', e); process.exit(1); });
