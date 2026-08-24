// lib/trip-track.js
// Trip & Track data collection, per Trip_Track_Reference_Spec.md section 2.
// Purely a background writer — no messages are sent for this part.

const fs = require('fs');
const path = require('path');
const config = require('../config');
const mettax = require('./mettax-client');
const geocoding = require('./geocoding');

const STATE_PATH = '/data/trip_track_state.json';
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

const excludedCustomersLower = new Set(config.excludedCustomers.map((name) => name.toLowerCase()));

function isExcluded(device) {
  return (
    excludedCustomersLower.has((device.customerName || '').toLowerCase()) ||
    config.excludedDeviceIds.includes(device.id)
  );
}

function toMettaxUtc(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function parseMettaxUtc(str) {
  return new Date(`${str.replace(' ', 'T')}Z`);
}

// MYT calendar date / time-of-day, derived by shifting the UTC instant by
// +8h and reading the fields back out in UTC (avoids relying on the host's
// own system timezone, since node-cron already isolates schedule timing
// from it but plain Date field getters don't).
function mytDateStr(utcDate) {
  return new Date(utcDate.getTime() + MYT_OFFSET_MS).toISOString().slice(0, 10);
}
function mytTimeStr(utcDate) {
  return new Date(utcDate.getTime() + MYT_OFFSET_MS).toISOString().slice(11, 19);
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { tripLastFetchUtc: null, gpsLastFetchUtc: null };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// Splits [from, to] into <= maxDays-sized chunks (MettaX's report endpoints
// reject windows wider than 1 day with code 20038).
function chunkWindows(from, to, maxDays = 1) {
  const chunks = [];
  let cursor = from;
  const maxMs = maxDays * 24 * 60 * 60 * 1000;
  while (cursor < to) {
    const chunkEnd = new Date(Math.min(cursor.getTime() + maxMs, to.getTime()));
    chunks.push([cursor, chunkEnd]);
    cursor = chunkEnd;
  }
  return chunks;
}

async function fetchAllPages(fetchPage) {
  const all = [];
  for (let pageIndex = 1; ; pageIndex++) {
    const data = await fetchPage(pageIndex);
    const recs = data.records || [];
    all.push(...recs);
    if (recs.length < 1000) break;
  }
  return all;
}

// --- Trip collection ---------------------------------------------------

// On a cold start (no checkpoint yet), bootstrap from 3h back — matching
// the normal steady-state gap between runs — rather than a full day. The
// spec only requires "since the last successful run"; it doesn't ask for a
// historical backfill, and a full-day first run across the whole fleet
// (especially GPS pings, much higher volume than trips) can take a very
// long time and run up a large one-off geocoding bill.
const BOOTSTRAP_WINDOW_MS = 3 * 60 * 60 * 1000;

async function collectTrips(db, deviceById, ids, now) {
  const state = loadState();
  const from = state.tripLastFetchUtc ? parseMettaxUtc(state.tripLastFetchUtc) : new Date(now.getTime() - BOOTSTRAP_WINDOW_MS);
  const windows = chunkWindows(from, now);
  if (windows.length === 0) return { inserted: 0, upTo: from };

  const insert = db.prepare(`
    INSERT INTO trip_records (company, vehicle, date, start_time, end_time, duration, mileage, avg_speed, max_speed, start_coord, end_coord)
    VALUES (@company, @vehicle, @date, @start_time, @end_time, @duration, @mileage, @avg_speed, @max_speed, @start_coord, @end_coord)
  `);
  const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(r); });

  let inserted = 0;
  let upTo = from;
  for (const [chunkStart, chunkEnd] of windows) {
    const records = await fetchAllPages((pageIndex) =>
      mettax.getTripPage(toMettaxUtc(chunkStart), toMettaxUtc(chunkEnd), ids, pageIndex)
    );

    const rows = records
      .filter((r) => deviceById.has(r.deviceId))
      .map((r) => {
        const device = deviceById.get(r.deviceId);
        const startUtc = parseMettaxUtc(r.startTime);
        return {
          company: device.customerName,
          vehicle: device.deviceName,
          date: mytDateStr(startUtc),
          start_time: mytTimeStr(startUtc),
          end_time: mytTimeStr(parseMettaxUtc(r.endTime)),
          duration: r.totalTimeConvert,
          mileage: r.totalMileageConvert,
          avg_speed: r.avgSpeedConvert,
          max_speed: r.maxSpeedConvert,
          start_coord: r.startLonLat,
          end_coord: r.endLonLat,
        };
      });
    insertMany(rows);
    inserted += rows.length;
    upTo = chunkEnd; // only advance past a chunk that fully succeeded
    saveState({ ...loadState(), tripLastFetchUtc: toMettaxUtc(upTo) });
  }
  return { inserted, upTo };
}

// --- GPS -> "stay" record collection ------------------------------------

// Rounds to ~11m precision so GPS jitter while genuinely stationary doesn't
// look like a location change (matches geocoding's own cache precision).
function roundCoord(n) {
  return Number(n.toFixed(4));
}

// Collapses one device's time-ordered pings into stay records: a run of
// consecutive pings at the same (rounded) location with the same ACC
// status becomes one row. A single stray ping still becomes a one-ping
// "stay" (arrive === leave) rather than being dropped.
function collapseIntoStays(pings) {
  const stays = [];
  let current = null;

  for (const p of pings) {
    const lat = roundCoord(p.lat);
    const lon = roundCoord(p.lon);
    if (current && current.lat === lat && current.lon === lon && current.acc === p.acc) {
      current.pings.push(p);
    } else {
      if (current) stays.push(current);
      current = { lat, lon, acc: p.acc, pings: [p] };
    }
  }
  if (current) stays.push(current);
  return stays;
}

async function collectGps(db, deviceById, ids, now) {
  const state = loadState();
  const from = state.gpsLastFetchUtc ? parseMettaxUtc(state.gpsLastFetchUtc) : new Date(now.getTime() - BOOTSTRAP_WINDOW_MS);
  const windows = chunkWindows(from, now);
  if (windows.length === 0) return { inserted: 0, upTo: from };

  const insert = db.prepare(`
    INSERT INTO raw_tracks (company, vehicle, date, arrive_time, leave_time, duration, coordinates, address, acc_status, speed)
    VALUES (@company, @vehicle, @date, @arrive_time, @leave_time, @duration, @coordinates, @address, @acc_status, @speed)
  `);
  const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(r); });

  let inserted = 0;
  let upTo = from;
  for (const [chunkStart, chunkEnd] of windows) {
    const records = await fetchAllPages((pageIndex) =>
      mettax.getGpsPage(toMettaxUtc(chunkStart), toMettaxUtc(chunkEnd), ids, pageIndex)
    );
    console.log(`Trip & Track: ${records.length} raw GPS pings fetched for ${toMettaxUtc(chunkStart)}..${toMettaxUtc(chunkEnd)}, collapsing into stays...`);

    const byDevice = new Map();
    for (const r of records) {
      if (!deviceById.has(r.deviceId)) continue;
      if (r.lat == null || r.lon == null) continue;
      if (!byDevice.has(r.deviceId)) byDevice.set(r.deviceId, []);
      byDevice.get(r.deviceId).push(r);
    }

    const rows = [];
    let devicesDone = 0;
    for (const [deviceId, pings] of byDevice) {
      pings.sort((a, b) => a.deviceTime.localeCompare(b.deviceTime));
      const device = deviceById.get(deviceId);
      for (const stay of collapseIntoStays(pings)) {
        const first = stay.pings[0];
        const last = stay.pings[stay.pings.length - 1];
        const arriveUtc = parseMettaxUtc(first.deviceTime);
        const leaveUtc = parseMettaxUtc(last.deviceTime);
        const durationMin = Math.round((leaveUtc.getTime() - arriveUtc.getTime()) / 60000);
        const avgSpeed = stay.pings.reduce((s, p) => s + (p.speed || 0), 0) / stay.pings.length;

        let address;
        try {
          address = await geocoding.getFullAddress(stay.lat, stay.lon);
        } catch (err) {
          console.error(`Trip & Track geocoding failed for ${device.deviceName}:`, err);
          address = null;
        }

        rows.push({
          company: device.customerName,
          vehicle: device.deviceName,
          date: mytDateStr(arriveUtc),
          arrive_time: mytTimeStr(arriveUtc),
          leave_time: mytTimeStr(leaveUtc),
          duration: `${durationMin} min`,
          coordinates: `${stay.lat},${stay.lon}`,
          address,
          acc_status: stay.acc === 1 ? 'ON' : 'OFF',
          speed: avgSpeed.toFixed(1),
        });
      }
      devicesDone++;
      if (devicesDone % 10 === 0) {
        console.log(`Trip & Track: ${devicesDone}/${byDevice.size} devices processed, ${rows.length} stays so far...`);
      }
    }
    insertMany(rows);
    inserted += rows.length;
    upTo = chunkEnd; // only advance past a chunk that fully succeeded
    saveState({ ...loadState(), gpsLastFetchUtc: toMettaxUtc(upTo) });
  }
  return { inserted, upTo };
}

// Runs both collectors. Each independently tracks + advances its own
// checkpoint only past chunks that actually succeeded — a failure partway
// through (bad token, empty device list, a chunk erroring out) leaves the
// checkpoint at the last good chunk boundary, so the failed window is
// retried next run rather than silently skipped.
async function runCollection(db) {
  const devices = (await mettax.getDeviceList()).filter((d) => !isExcluded(d));
  if (devices.length === 0) throw new Error('device list came back empty');
  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const ids = devices.map((d) => d.id);
  const now = new Date();

  // Isolated on purpose: a trip-collection failure must not block GPS
  // collection (or vice versa) — each has its own checkpoint per spec.
  const results = { tripsInserted: 0, staysInserted: 0, errors: [] };

  try {
    results.tripsInserted = (await collectTrips(db, deviceById, ids, now)).inserted;
  } catch (err) {
    results.errors.push(`trip collection: ${err.message}`);
  }

  try {
    results.staysInserted = (await collectGps(db, deviceById, ids, now)).inserted;
  } catch (err) {
    results.errors.push(`gps collection: ${err.message}`);
  }

  if (results.errors.length > 0) {
    throw new Error(results.errors.join('; '));
  }
  return results;
}

module.exports = { runCollection, STATE_PATH };
