// lib/dashboard.js
// Read-only dashboard API over alert_log. Local-only tool — no auth.

const mettax = require('./mettax-client');

const ALERT_TYPES = ['daily_alert', 'communication_lost', 'berkat_satu_hourly', 'motion_offline'];

// Columns the UI is allowed to sort by. Whitelisted deliberately — sortBy
// comes from the query string, and building SQL with an unchecked column
// name would be an injection hole.
const SORTABLE_COLUMNS = {
  created_at: 'created_at',
  alert_type: 'alert_type',
  status: 'status',
  tenant: "COALESCE(tenant, '')", // batch alerts (Daily/CommLost) have no
                                    // single tenant; they sort first/last as ''
  device: "COALESCE(device, '')",
};

function registerDashboardRoutes(app, db) {
  // GET /api/alerts?type=&tenant=&status=&from=&to=&sortBy=&sortDir=&page=&pageSize=
  app.get('/api/alerts', (req, res) => {
    const { type, tenant, status, from, to } = req.query;

    const sortBy = SORTABLE_COLUMNS[req.query.sortBy] ? req.query.sortBy : 'created_at';
    const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 1), 200);
    const offset = (page - 1) * pageSize;

    const where = [];
    const params = [];

    if (type) { where.push('alert_type = ?'); params.push(type); }
    if (status) { where.push('status = ?'); params.push(status); }
    if (from) { where.push('created_at >= ?'); params.push(from); }
    if (to) { where.push('created_at <= ?'); params.push(to); }
    if (tenant) {
      // Matches rows scoped directly to this tenant (Berkat Satu, Motion
      // Offline) OR batch rows (Daily Alert, Communication Lost) whose
      // tenant_breakdown JSON mentions this tenant name.
      where.push('(tenant = ? OR tenant_breakdown LIKE ?)');
      params.push(tenant, `%"name":"${tenant}"%`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderClause = `ORDER BY ${SORTABLE_COLUMNS[sortBy]} ${sortDir}, id ${sortDir}`;

    try {
      const total = db.prepare(`SELECT COUNT(*) AS c FROM alert_log ${whereClause}`).get(...params).c;

      const rows = db.prepare(`
        SELECT id, alert_type, status, tenant, device, tenant_breakdown, error, created_at,
               substr(message_text, 1, 4000) AS message_text
        FROM alert_log
        ${whereClause}
        ${orderClause}
        LIMIT ? OFFSET ?
      `).all(...params, pageSize, offset).map((r) => ({
        ...r,
        tenant_breakdown: r.tenant_breakdown ? JSON.parse(r.tenant_breakdown) : null,
      }));

      res.json({ rows, total, page, pageSize, sortBy, sortDir: sortDir.toLowerCase() });
    } catch (err) {
      console.error('GET /api/alerts failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/tenants — canonical, alphabetically sorted tenant list.
  // Tries live MettaX device data first (so tenants with zero alerts still
  // show up in the filter); falls back to whatever's in alert_log if MettaX
  // is unreachable, and reports which source was used + any error either way.
  app.get('/api/tenants', async (req, res) => {
    try {
      const devices = await mettax.getDeviceList();
      const tenants = [...new Set(devices.map((d) => d.customerName).filter(Boolean))].sort();
      return res.json({ tenants, source: 'mettax' });
    } catch (mettaxErr) {
      try {
        const direct = db.prepare(
          `SELECT DISTINCT tenant FROM alert_log WHERE tenant IS NOT NULL`
        ).all().map((r) => r.tenant);
        const breakdownRows = db.prepare(
          `SELECT tenant_breakdown FROM alert_log WHERE tenant_breakdown IS NOT NULL`
        ).all();
        const fromBreakdown = new Set();
        for (const row of breakdownRows) {
          try {
            JSON.parse(row.tenant_breakdown).forEach((t) => fromBreakdown.add(t.name));
          } catch { /* skip malformed row */ }
        }
        const tenants = [...new Set([...direct, ...fromBreakdown])].sort();
        return res.json({
          tenants,
          source: 'alert_log_fallback',
          warning: `Live MettaX tenant list unavailable (${mettaxErr.message}). Showing tenants seen in past alerts instead — this list may be incomplete.`,
        });
      } catch (dbErr) {
        console.error('GET /api/tenants failed (both MettaX and DB fallback):', mettaxErr, dbErr);
        return res.status(500).json({ error: `MettaX: ${mettaxErr.message}; DB fallback also failed: ${dbErr.message}` });
      }
    }
  });

  // GET /api/alerts/summary — counts by type/status over the last 24h.
  app.get('/api/alerts/summary', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT alert_type, status, COUNT(*) AS count
        FROM alert_log
        WHERE created_at >= datetime('now', '-1 day')
        GROUP BY alert_type, status
      `).all();

      const summary = {};
      for (const t of ALERT_TYPES) summary[t] = { SENT: 0, SKIPPED: 0, FAILED: 0 };
      for (const r of rows) {
        if (!summary[r.alert_type]) summary[r.alert_type] = { SENT: 0, SKIPPED: 0, FAILED: 0 };
        summary[r.alert_type][r.status] = r.count;
      }
      res.json({ summary });
    } catch (err) {
      console.error('GET /api/alerts/summary failed:', err);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerDashboardRoutes };
