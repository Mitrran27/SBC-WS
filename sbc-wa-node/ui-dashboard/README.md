# Lorry System Dashboard (SvelteKit)

Sits alongside `app.js` (unchanged — still owns the WhatsApp bot, scheduler,
and the `/api/alerts*` endpoints from `lib/dashboard.js`).

## Setup

```bash
cd ui-dashboard
npm install
npm run dev
```

Keep `node app.js` running separately on port 3000 — the dev server proxies
`/api/*` to it (see `vite.config.js`), so no CORS setup is needed.

## What's implemented

- **Sorting** — click any column header (Time, Type, Status, Tenant, Device)
  to sort by it; click again to flip direction. Sorting happens server-side
  (`lib/dashboard.js`'s `/api/alerts` endpoint, via a whitelisted column
  map — never raw user input in the SQL). Tenant/Device sort batch alerts
  (which have no single tenant) as blank, grouped at one end.
- **Pagination** — 10 rows per page, server-side (`LIMIT`/`OFFSET`), with a
  windowed page-number control and a "12–21 of 340" range label.
- **Tenant list** — `/api/tenants` pulls the canonical, alphabetically
  sorted tenant list live from MettaX (`device/list`), not just tenants
  that happen to have alert history — so a tenant with zero alerts still
  shows up in the filter. Falls back to deriving the list from `alert_log`
  if MettaX is unreachable, and says so.
- **Error surfacing** — alerts, tenants, and the summary cards each fetch
  independently and show their own error banner with the real server
  message if something fails, rather than one message failing silently or
  taking down the whole page.

## Component structure

```
src/lib/components/
  SummaryCard.svelte    — one 24h stat card (×4, one per alert type)
  FilterBar.svelte      — type/tenant/status/date filters + auto-refresh
  SortableHeader.svelte — one clickable <th>, used ×5 in AlertTable
  AlertTable.svelte     — table shell, composes SortableHeader × AlertRow
  AlertRow.svelte       — one expandable row (click for full message/error)
  Pagination.svelte     — page numbers + prev/next + range label
  StatusBadge.svelte    — SENT/SKIPPED/FAILED label, used in cards + rows
  TenantPill.svelte     — clickable tenant tag; click filters the dashboard
  ErrorBanner.svelte    — error/warning banner, used per data section
  Clock.svelte          — live MYT clock, ticks independently
```

`+page.svelte` owns all state and passes it down as props, receiving
changes back via callback props (`onApply`, `onSort`, `onPageChange`,
`onTenantClick`) — no global store needed at this size.

## Viewing the database directly

You don't need a UI for this at all — it's a plain SQLite file at
`/data/node_storage.db` (WSL path; from Windows that's
`\\wsl.localhost\Ubuntu\data\node_storage.db`, adjust the distro name if
different). Easiest options:

- **DB Browser for SQLite** (free, GUI, Windows/Mac/Linux) —
  https://sqlitebrowser.org — open the file above directly, browse/edit any
  table (`alert_log`, `trip_records`, `raw_tracks`, `message_queue`,
  `recipients`), and run raw SQL queries.
- **VS Code extension** — "SQLite Viewer" or "SQLite" in the marketplace,
  lets you browse the file inside the editor you're already using.
- **CLI**, if you installed `sqlite3` earlier:
  ```bash
  sqlite3 /data/node_storage.db
  .tables
  SELECT * FROM alert_log ORDER BY created_at DESC LIMIT 20;
  ```

This dashboard only exposes `alert_log` (via the API/sorting/pagination
above) — for the other tables (`trip_records`, `raw_tracks`,
`message_queue`, `recipients`, `ghost_messages`), one of the tools above is
the direct way to look at them.
