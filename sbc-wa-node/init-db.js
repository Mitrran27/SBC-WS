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

  CREATE TABLE IF NOT EXISTS alert_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_type TEXT NOT NULL, -- 'daily_alert' | 'communication_lost' | 'berkat_satu_hourly' | 'motion_offline'
    status TEXT CHECK(status IN ('SENT', 'SKIPPED', 'FAILED')) NOT NULL,
    message_text TEXT,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Trip & Track (per Trip_Track_Reference_Spec.md), schemas as specified.
  CREATE TABLE IF NOT EXISTS trip_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT,
      vehicle TEXT,
      date TEXT,
      start_time TEXT,
      end_time TEXT,
      duration TEXT,
      mileage TEXT,
      avg_speed TEXT,
      max_speed TEXT,
      start_coord TEXT,
      end_coord TEXT,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS raw_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT,
      vehicle TEXT,
      date TEXT,
      arrive_time TEXT,
      leave_time TEXT,
      duration TEXT,
      coordinates TEXT,
      address TEXT,
      acc_status TEXT,
      speed TEXT,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add dashboard columns to alert_log if this DB predates them (SQLite has no
// ALTER TABLE ADD COLUMN IF NOT EXISTS, so check pragma first).
const alertLogColumns = db.prepare("PRAGMA table_info(alert_log)").all().map((c) => c.name);
for (const [col, def] of [
  ['tenant', 'TEXT'],
  ['device', 'TEXT'],
  ['tenant_breakdown', 'TEXT'],
]) {
  if (!alertLogColumns.includes(col)) {
    db.exec(`ALTER TABLE alert_log ADD COLUMN ${col} ${def}`);
    console.log(`Migrated alert_log: added column "${col}".`);
  }
}

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
