# SBC WhatsApp Edge Node

Scaffolded from the "Decentralized WhatsApp Notification Edge Nodes" spec, Section B.

## Setup

```bash
# 1. Install Node.js v18/20 LTS + build tools (needed for better-sqlite3's native module)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential python3

# 2. Install dependencies
npm install

# 3. Create the SQLite database (creates /data/node_storage.db)
sudo mkdir -p /data && sudo chown $USER:$USER /data
npm run init-db

# 4. Start the service
npm start
```

On first run, `app.js` will print a QR code in the terminal — scan it with the
WhatsApp account this node should use (same as linking WhatsApp Web). Session
data is stored in `/data/baileys_auth` so you only need to scan once.

## Test it

```bash
curl -X POST http://localhost:3000/api/v1/notify \
  -H "Content-Type: application/json" \
  -d '{"phone":"60123456789","message":"Test alert from edge node"}'
```

Check the queue directly:

```bash
sqlite3 /data/node_storage.db "SELECT * FROM message_queue ORDER BY id DESC LIMIT 5;"
```

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
# SBC-WS
