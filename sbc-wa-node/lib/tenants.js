// lib/tenants.js
// Persisted, editable registry of tenants (customers) eligible for Berkat
// Satu Hourly, stored at /data/tenants.json. New customer names seen from
// MettaX are auto-added (enabled by default) the first time they appear;
// existing entries are never overwritten, so hand-editing a tenant to
// `enabled: false` sticks — it won't get silently re-enabled just because
// MettaX still reports that customer.

const fs = require('fs');
const path = require('path');

const TENANTS_PATH = '/data/tenants.json';

function load() {
  try {
    return JSON.parse(fs.readFileSync(TENANTS_PATH, 'utf8'));
  } catch {
    return { tenants: [] };
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(TENANTS_PATH), { recursive: true });
  fs.writeFileSync(TENANTS_PATH, JSON.stringify(data, null, 2));
}

// liveCustomerNames: customer names currently seen from MettaX's device
// list (already excluding config.excludedCustomers). Adds any name not
// already on record (enabled: true), persists if anything changed, and
// returns the set of names currently enabled.
function syncAndGetEnabledNames(liveCustomerNames) {
  const data = load();
  const known = new Map(data.tenants.map((t) => [t.name, t]));

  let changed = false;
  for (const name of liveCustomerNames) {
    if (!known.has(name)) {
      known.set(name, { name, enabled: true });
      changed = true;
    }
  }

  if (changed) {
    data.tenants = [...known.values()];
    save(data);
  }

  return new Set([...known.values()].filter((t) => t.enabled !== false).map((t) => t.name));
}

module.exports = { syncAndGetEnabledNames, TENANTS_PATH };
