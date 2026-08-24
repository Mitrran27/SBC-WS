// lib/geocoding.js
// Reverse-geocodes lat/lon into a shortened street address for Motion
// Offline Alert, via Google's Geocoding API. Caches by rounded coordinate
// so repeated lookups for the same spot don't re-hit the API (per spec).

const config = require('../config');

const cache = new Map();

// Google's formatted_address is ordered specific -> general, comma-separated
// (e.g. "Jalan Ampang, 50450 Kuala Lumpur, Selangor, Malaysia"). Per spec,
// drop the last two segments (state, country) and end with a period.
function shortenAddress(formattedAddress) {
  const parts = formattedAddress.split(', ');
  if (parts.length <= 2) return `${formattedAddress}.`;
  return `${parts.slice(0, -2).join(', ')}.`;
}

// Cache key rounded to ~11m precision (4 decimal places) — GPS jitter at a
// given "stuck" spot won't produce meaningfully different addresses.
function cacheKey(lat, lon) {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

async function lookup(lat, lon) {
  const key = cacheKey(lat, lon);
  if (cache.has(key)) return cache.get(key);

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lon}`);
  url.searchParams.set('key', config.google.geocodingApiKey);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Geocoding request failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  if (body.status !== 'OK' || !body.results.length) {
    throw new Error(`Geocoding failed for ${lat},${lon}: ${body.status}`);
  }

  const full = body.results[0].formatted_address;
  const result = { full, short: shortenAddress(full) };
  cache.set(key, result);
  return result;
}

// Shortened form (drops state/country) — used by Motion Offline Alert.
async function getShortAddress(lat, lon) {
  return (await lookup(lat, lon)).short;
}

// Full Google-formatted address — used by Trip & Track's raw_tracks, which
// (unlike Motion Offline Alert) has no spec'd shortening rule.
async function getFullAddress(lat, lon) {
  return (await lookup(lat, lon)).full;
}

module.exports = { getShortAddress, getFullAddress, shortenAddress };
