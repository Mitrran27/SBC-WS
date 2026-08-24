// lib/mettax-client.js
// MettaX API client. Caches the auth token for 40 hours (spec says tokens are
// valid up to 48h; we refresh a bit early to avoid edge-of-expiry failures).

const config = require('../config');

let cachedToken = null;
let tokenFetchedAt = 0;
const TOKEN_TTL_MS = 40 * 60 * 60 * 1000; // 40 hours

// MettaX always responds with HTTP 200 and encodes success/failure in the
// body as { code, data, msg } — code 0 means success, anything else is an
// error (401 = not logged in / bad token, etc). HTTP status is not
// meaningful here except for transport-level failures.
async function parseMettaxResponse(res, label) {
  if (!res.ok) {
    throw new Error(`MettaX request failed (${label}): ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  if (body.code !== 0) {
    throw new Error(`MettaX request failed (${label}): code ${body.code} ${body.msg}`);
  }
  return body.data;
}

async function getToken() {
  const now = Date.now();
  if (cachedToken && now - tokenFetchedAt < TOKEN_TTL_MS) {
    return cachedToken;
  }

  const res = await fetch(`${config.mettax.baseUrl}/v2/openapi/system/createToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: config.mettax.apiKey,
      apiSecret: config.mettax.apiSecret,
    }),
  });

  cachedToken = await parseMettaxResponse(res, 'createToken');
  tokenFetchedAt = now;
  return cachedToken;
}

// All MettaX data endpoints are POST-only with a JSON body (a GET with the
// same params returns code 405 "Incorrect request method"). Auth header is
// the raw token string, no "Bearer " prefix. MettaX occasionally answers
// with a transient "try again" code under load — 10002 "Busy now,please
// wait" and 61001 "Loading,please wait" have both been seen — retry a few
// times with backoff rather than surfacing those as hard failures.
const RETRYABLE_CODES = new Set([10002, 61001]);

async function mettaxPost(path, body = {}, { retries = 4, retryDelayMs = 3000 } = {}) {
  const token = await getToken();
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${config.mettax.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const parsed = await res.json();
      if (RETRYABLE_CODES.has(parsed.code) && attempt <= retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
      if (parsed.code !== 0) {
        throw new Error(`MettaX request failed (${path}): code ${parsed.code} ${parsed.msg}`);
      }
      return parsed.data;
    }
    throw new Error(`MettaX request failed (${path}): ${res.status} ${await res.text()}`);
  }
}

// --- Endpoint wrappers, per the spec ---

// All devices this account can see, with their customer + device names.
// subsumption:true includes devices under sub-accounts. pageSize is set
// high enough to return the whole fleet in one call (device/list appears
// to ignore pagination and return everything regardless of pageSize).
async function getDeviceList() {
  return mettaxPost('/v2/openapi/device/list', { subsumption: true, pageNum: 1, pageSize: 1000 });
}

// Alarm/alert records for the Daily Alert (5x/day, all customers).
// deviceIds is required (comma-separated) and the [startUtc, endUtc] window
// cannot exceed 31 days (MettaX rejects wider windows with code 20012).
async function getAlarmPage(startUtc, endUtc, deviceIds, pageNum = 1) {
  return mettaxPost('/v2/openapi/alarm/alarmPage', {
    startTime: startUtc,
    endTime: endUtc,
    deviceIds: Array.isArray(deviceIds) ? deviceIds.join(',') : deviceIds,
    pageNum,
    pageSize: 1000,
  });
}

// Device "shadow" — last known state per device. Used by Communication Lost,
// Berkat Satu Hourly, and Motion Offline Alert. Only returns entries for
// devices that have reported at least once; a device absent from the
// result has never reported anything at all.
async function getDeviceShadow(deviceIds) {
  return mettaxPost('/v2/openapi/device/shadow/deviceIds', {
    deviceIds: Array.isArray(deviceIds) ? deviceIds.join(',') : deviceIds,
  });
}

// Completed trip records for Trip & Track. deviceIds required; the
// [startUtc, endUtc] window cannot exceed 1 day (MettaX rejects wider
// windows with code 20038 "Only data within 1 day can be queried") — much
// stricter than alarmPage's 31-day cap.
async function getTripPage(startUtc, endUtc, deviceIds, pageIndex = 1) {
  return mettaxPost('/v2/report/pageTrip', {
    deviceIds: Array.isArray(deviceIds) ? deviceIds.join(',') : deviceIds,
    start: startUtc,
    end: endUtc,
    pageIndex,
    pageSize: 1000,
  });
}

// Raw GPS pings for Trip & Track (collapsed into "stay" records by the
// caller). isNotActual:false and type:"1,2,3" are required — omitting
// either causes a misleading code 10002 "Busy now" that looks like a rate
// limit but is actually just a malformed-request response.
async function getGpsPage(startUtc, endUtc, deviceIds, pageIndex = 1) {
  return mettaxPost('/v2/report/pageGps', {
    deviceIds: Array.isArray(deviceIds) ? deviceIds.join(',') : deviceIds,
    start: startUtc,
    end: endUtc,
    isNotActual: false,
    type: '1,2,3',
    pageIndex,
    pageSize: 1000,
  });
}

module.exports = {
  getToken,
  getDeviceList,
  getAlarmPage,
  getDeviceShadow,
  getTripPage,
  getGpsPage,
};
