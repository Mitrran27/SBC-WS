const express = require('express');
const Database = require('better-sqlite3');
const qrcode = require('qrcode-terminal');
const qrcodeImage = require('qrcode');
const pino = require('pino');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const logger = pino({ level: 'warn' });

const db = new Database('/data/node_storage.db');
const app = express();
app.use(express.json());

// Initialize Baileys Socket
let sock;
async function initWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('/data/baileys_auth');
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({
    auth: state,
    version,
    logger,
    syncFullHistory: false,
  });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
    if (qr) {
      qrcode.generate(qr, { small: true });
      qrcodeImage.toFile(__dirname + '/qr.png', qr, { width: 400 });
    }
    if (connection === 'open') console.log('WhatsApp connection established.');
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        console.log('Connection closed, reconnecting...');
        initWhatsApp();
      } else {
        console.log('Logged out. Delete /data/baileys_auth and re-run to pair again.');
      }
    }
  });

  // Listen for inbound messages to auto-verify contacts
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type === 'notify') {
      for (const msg of messages) {
        if (!msg.key.fromMe) {
          const sender = msg.key.remoteJid.split('@')[0];
          db.prepare(`
            INSERT INTO recipients (phone, status, last_interaction)
            VALUES (?, 2, CURRENT_TIMESTAMP)
            ON CONFLICT(phone) DO UPDATE SET status = 2, last_interaction = CURRENT_TIMESTAMP
          `).run(sender);
        }
      }
    }
  });
}
initWhatsApp();

// 1. API Endpoint: Enqueue Notification
app.post('/api/v1/notify', (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'Missing phone or message' });
  }

  const recipient = db.prepare('SELECT status FROM recipients WHERE phone = ?').get(phone);
  if (recipient && recipient.status === 3) {
    return res.status(403).json({ error: 'User opt-in expired/suspended. Delivery aborted.' });
  }

  const stmt = db.prepare('INSERT INTO message_queue (recipient_phone, message_text) VALUES (?, ?)');
  const info = stmt.run(phone, message);
  res.status(200).json({ status: 'queued', job_id: info.lastInsertRowid });
});

// 2. Queue Worker (strict pacing loop)
async function processQueue() {
  while (true) {
    const job = db.prepare("SELECT * FROM message_queue WHERE status = 'PENDING' ORDER BY id ASC LIMIT 1").get();
    if (job) {
      db.prepare("UPDATE message_queue SET status = 'PROCESSING' WHERE id = ?").run(job.id);
      try {
        const jid = `${job.recipient_phone}@s.whatsapp.net`;

        await sock.sendPresenceUpdate('composing', jid);
        const typingDelay = Math.floor(Math.random() * 3000) + 3000;
        await new Promise(r => setTimeout(r, typingDelay));

        await sock.sendMessage(jid, { text: job.message_text });
        db.prepare("UPDATE message_queue SET status = 'SENT', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(job.id);

        const interMessageDelay = Math.floor(Math.random() * 8000) + 12000;
        await new Promise(r => setTimeout(r, interMessageDelay));
      } catch (err) {
        console.error(`Failed to send job ${job.id}:`, err);
        db.prepare("UPDATE message_queue SET status = 'FAILED', retry_count = retry_count + 1 WHERE id = ?").run(job.id);
      }
    } else {
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}
processQueue();

app.listen(3000, () => console.log('Edge node API running on port 3000'));
