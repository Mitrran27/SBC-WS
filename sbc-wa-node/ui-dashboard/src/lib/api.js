// src/lib/api.js
// Every fetch call in the app goes through here. Errors are thrown with the
// server's actual message (from the JSON {error} body) rather than a
// generic "request failed" — the UI shows this text directly.

async function getJSON(url) {
  let res;
  try {
    res = await fetch(url);
  } catch (networkErr) {
    throw new Error(`Network error — is the API server running? (${networkErr.message})`);
  }

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Server returned a non-JSON response (HTTP ${res.status})`);
  }

  if (!res.ok) {
    throw new Error(body.error || `Request failed (HTTP ${res.status})`);
  }
  return body;
}

export async function fetchAlerts({ type, tenant, status, from, to, sortBy, sortDir, page, pageSize } = {}) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (tenant) params.set('tenant', tenant);
  if (status) params.set('status', status);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (sortBy) params.set('sortBy', sortBy);
  if (sortDir) params.set('sortDir', sortDir);
  params.set('page', page || 1);
  params.set('pageSize', pageSize || 10);

  // { rows, total, page, pageSize, sortBy, sortDir }
  return getJSON(`/api/alerts?${params.toString()}`);
}

export async function fetchTenants() {
  // { tenants, source, warning? } — warning means it fell back to a
  // possibly-incomplete list (MettaX was unreachable), not a hard failure.
  return getJSON('/api/tenants');
}

export async function fetchSummary() {
  const { summary } = await getJSON('/api/alerts/summary');
  return summary;
}
