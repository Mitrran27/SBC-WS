# SBC WhatsApp Edge Node

Scaffolded from the "Decentralized WhatsApp Notification Edge Nodes" spec, Section B.

## Setup from scratch (Windows dev machine, via WSL)

The production target is a Linux SBC (see [Setup from scratch (Linux / the
target SBC)](#setup-from-scratch-linux--the-target-sbc) below), but for local
development on Windows the easiest path is WSL — native modules need a Linux
build, and WSL gives you that without a separate machine.

```bash
# 1. Open a WSL terminal (Ubuntu). Check Node is installed:
node --version   # v18 or v20 LTS recommended
npm --version

# 2. From the project folder (via the WSL path, not C:\...):
cd /mnt/c/Users/<you>/Downloads/SBC-WS/sbc-wa-node

# 3. Install dependencies — this compiles better-sqlite3's native module
#    for whatever OS you run it on, so always install fresh per-environment.
npm install

# 4. Create the SQLite database (creates /data/node_storage.db)
node init-db.js
# or: npm run init-db

# 5. Start the service
node app.js
# or: npm start
```

On first run, `app.js` prints a QR code in the terminal (and also saves it as
`qr.png` in this folder as a fallback if the ASCII art doesn't render well).
Scan it from WhatsApp: **Settings → Linked Devices → Link a Device**. Session
data is stored in `/data/baileys_auth` so you only need to scan once — unless
you unlink the device from your phone, which invalidates the session and
requires a fresh scan.

After scanning, WhatsApp sends a "restart required" signal as a normal part
of first-time pairing — the app handles this automatically and reconnects on
its own. You should see `WhatsApp connection established.` within a few
seconds. If you instead see `Logged out.`, delete `/data/baileys_auth` and
scan again.

### Don't mix environments

Native modules (`better-sqlite3`) are compiled per-OS — a `node_modules`
folder built on Windows will crash with `invalid ELF header` under WSL/Linux,
and vice versa with `not a valid Win32 application`. Pick one environment
(WSL is recommended) and run `npm install` fresh there; don't copy
`node_modules` between them. Each environment also gets its own `/data`
folder and WhatsApp session — running both at once will fight over the same
linked device and knock each other offline (WhatsApp reports this as a
`device_removed` conflict).

## Test it

```bash
curl -X POST http://localhost:3000/api/v1/notify \
  -H "Content-Type: application/json" \
  -d '{"phone":"60123456789","message":"Test alert from edge node"}'
```

This returns `{"status":"queued","job_id":...}` immediately; the queue
worker picks it up within a few seconds (it adds a deliberate typing-delay
before sending, to look organic).

### Viewing the database

The `sqlite3` CLI isn't installed by default on most systems. Easiest
options:

- **On Linux**, just install the CLI:
  ```bash
  sudo apt install -y sqlite3
  sqlite3 /data/node_storage.db "SELECT * FROM message_queue ORDER BY id DESC LIMIT 5;"
  ```
- **VS Code extension** — install "SQLite Viewer" or "SQLite", then open the
  `.db` file directly in the editor.
- **One-off query from Node** (no install needed, works on any OS):
  ```bash
  node -e "const db=require('better-sqlite3')('/data/node_storage.db'); console.log(db.prepare('SELECT * FROM message_queue').all());"
  ```
- **DB Browser for SQLite** (sqlitebrowser.org) — standalone GUI app.

## Setup from scratch (Linux / the target SBC)

This is the production target per the spec — a real SBC running Linux — but
the same steps work for any Linux machine (a VM, a spare laptop, etc.) if you
want to test outside WSL.

```bash
# 1. Install Node.js v18/20 LTS + build tools (needed for better-sqlite3's native module)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential python3

# 2. From the project folder:
cd sbc-wa-node

# 3. Install dependencies — this compiles better-sqlite3's native module
#    for this machine's OS/architecture, so always install fresh per box
#    rather than copying node_modules from elsewhere (see note below).
npm install

# 4. Create the SQLite database (creates /data/node_storage.db)
sudo mkdir -p /data && sudo chown $USER:$USER /data
node init-db.js
# or: npm run init-db

# 5. Start the service
node app.js
# or: npm start
```

On first run, `app.js` prints a QR code in the terminal (and also saves it as
`qr.png` in this folder as a fallback if the ASCII art doesn't render well in
your terminal). Scan it from WhatsApp: **Settings → Linked Devices → Link a
Device**. Session data is stored in `/data/baileys_auth` so you only need to
scan once — unless you unlink the device from your phone, which invalidates
the session and requires a fresh scan.

After scanning, WhatsApp sends a "restart required" signal as a normal part
of first-time pairing — the app handles this automatically and reconnects on
its own. You should see `WhatsApp connection established.` within a few
seconds. If you instead see `Logged out.`, delete `/data/baileys_auth` and
scan again.

Each SBC has its own independent database and its own linked WhatsApp
device — running `init-db.js` and pairing needs to happen once per physical
unit, not once globally. Native modules (`better-sqlite3`) are also compiled
per-OS/architecture, so don't copy `node_modules` from your dev machine onto
the SBC (or between an x86 dev box and an ARM SBC) — always run `npm install`
fresh on the target device.

## Not included here

The spec's other pieces — network routing config (A.2), the modem watchdog
script (A.3), the sticky routing snippet for the central platform (B.3), and
the ghost-chat / recipient purge logic (C.2, C.3) — aren't wired into this
scaffold. They involve real hardware (specific GPIO pins, modem/carrier
settings) or raise their own considerations (the ghost-chat daemon is
specifically designed to spoof organic activity to WhatsApp's anti-abuse
detection, which is worth discussing with your team before deploying it).
Happy to help build any of those out once you're ready.

## Notes

- Run `npm run init-db` once per node — each SBC has its own independent
  database, so this needs to happen on every physical unit.
- `better-sqlite3` compiles from source on install; if it fails, double check
  `build-essential` and `python3` are installed on the SBC.
- Baileys is an unofficial library that mimics the WhatsApp Web protocol —
  it can break when WhatsApp updates their client, and using it is outside
  WhatsApp's Terms of Service. Worth knowing before you depend on it for
  anything business-critical.
