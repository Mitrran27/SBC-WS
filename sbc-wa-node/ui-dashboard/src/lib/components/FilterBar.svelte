<script>
  import { ALERT_TYPES } from '../constants.js';

  /** @type {{ tenants: string[], filters: object, onApply: (f: object) => void, onClear: () => void, autoRefresh: boolean, onAutoRefreshChange: (v: boolean) => void }} */
  let { tenants, filters, onApply, onClear, autoRefresh, onAutoRefreshChange } = $props();

  let type = $state(filters.type || '');
  let tenant = $state(filters.tenant || '');
  let status = $state(filters.status || '');
  let from = $state(filters.from || '');
  let to = $state(filters.to || '');

  // Lets a parent push a new tenant filter in (e.g. clicking a tenant pill
  // in the table) without FilterBar needing to know why it changed.
  $effect(() => {
    tenant = filters.tenant || '';
  });

  function apply() {
    onApply({
      type, tenant, status,
      from: from ? from.replace('T', ' ') + ':00' : '',
      to: to ? to.replace('T', ' ') + ':00' : '',
    });
  }

  function clear() {
    type = tenant = status = from = to = '';
    onClear();
  }
</script>

<div class="toolbar">
  <select bind:value={type}>
    <option value="">All types</option>
    {#each ALERT_TYPES as t (t.key)}
      <option value={t.key}>{t.label}</option>
    {/each}
  </select>

  <select bind:value={tenant}>
    <option value="">All tenants ({tenants.length})</option>
    {#each tenants as t (t)}
      <option value={t}>{t}</option>
    {/each}
  </select>

  <select bind:value={status}>
    <option value="">All statuses</option>
    <option value="SENT">Sent</option>
    <option value="SKIPPED">Skipped</option>
    <option value="FAILED">Failed</option>
  </select>

  <input type="datetime-local" bind:value={from} />
  <span class="to-label">to</span>
  <input type="datetime-local" bind:value={to} />

  <button onclick={apply}>Filter</button>
  <button class="ghost" onclick={clear}>Clear</button>

  <div class="spacer"></div>

  <label class="autorefresh">
    <input type="checkbox" checked={autoRefresh} onchange={(e) => onAutoRefreshChange(e.target.checked)} />
    Auto-refresh (30s)
  </label>
</div>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 18px 28px 10px;
  }
  select, input[type='datetime-local'] {
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 7px;
    padding: 7px 10px;
    font-size: 13px;
    font-family: var(--sans);
  }
  select:focus, input:focus {
    outline: 1.5px solid var(--accent);
  }
  button {
    background: var(--accent);
    border: none;
    color: #0c1220;
    font-weight: 650;
    border-radius: 7px;
    padding: 7px 14px;
    font-size: 13px;
    cursor: pointer;
  }
  button.ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    font-weight: 500;
  }
  .to-label {
    color: var(--muted);
    font-size: 12.5px;
  }
  .spacer {
    flex: 1;
  }
  .autorefresh {
    color: var(--muted);
    font-size: 12.5px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
</style>
