// init-db.js
// Run once (`node init-db.js`) to create /data/node_storage.db with the schema
// from Section B.2 of the spec. Safe to re-run — uses IF NOT EXISTS.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = '/data';
const DB_PATH = path.join(DATA_DIR, 'node_storage.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS message_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_phone TEXT NOT NULL,
    message_text TEXT NOT NULL,
    status TEXT CHECK(status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED')) DEFAULT 'PENDING',
    retry_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS recipients (
    phone TEXT PRIMARY KEY,
    status INTEGER DEFAULT 0, -- 0: Awaiting Opt-in, 1: Reminder Sent, 2: Active/Verified, 3: Suspended/Purged
    last_interaction DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ghost_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phrase TEXT NOT NULL,
    category TEXT DEFAULT 'casual'
  );
`);

// Seed a few placeholder phrases so the ghost_messages table isn't empty.
// The doc calls for 5,000+ — replace this with your real phrase list.
const seedCount = db.prepare('SELECT COUNT(*) AS c FROM ghost_messages').get().c;
if (seedCount === 0) {
  const insert = db.prepare('INSERT INTO ghost_messages (phrase, category) VALUES (?, ?)');
  const seedPhrases = [
    'hey, all good on your end?',
    'lunch later?',
    'did you see the update',
    'ok noted',
    'thanks!'
  ];
  const insertMany = db.transaction((phrases) => {
    for (const p of phrases) insert.run(p, 'casual');
  });
  insertMany(seedPhrases);
  console.log(`Seeded ${seedPhrases.length} placeholder ghost_messages rows.`);
}

console.log(`Database ready at ${DB_PATH}`);
db.close();
