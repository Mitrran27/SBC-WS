<script>
  import StatusBadge from './StatusBadge.svelte';
  import TenantPill from './TenantPill.svelte';
  import { TYPE_LABELS, formatMyt } from '../constants.js';

  /** @type {{ row: object, onTenantClick: (name: string) => void }} */
  let { row, onTenantClick } = $props();

  let expanded = $state(false);
</script>

<tr class={'rail-' + row.status.toLowerCase()} onclick={() => (expanded = !expanded)}>
  <td class="time">{formatMyt(row.created_at)}</td>
  <td><span class="type-badge">{TYPE_LABELS[row.alert_type] || row.alert_type}</span></td>
  <td><StatusBadge status={row.status} /></td>
  <td>
    {#if row.tenant_breakdown}
      {#each row.tenant_breakdown as t (t.name)}
        <TenantPill name={t.name} count={t.count} onclick={() => onTenantClick(t.name)} />
      {/each}
    {:else if row.tenant}
      <TenantPill name={row.tenant} onclick={() => onTenantClick(row.tenant)} />
    {:else}
      <span class="dash">—</span>
    {/if}

    {#if expanded}
      {#if row.status === 'FAILED'}
        <div class="error-text">{row.error}</div>
      {:else if row.status === 'SKIPPED'}
        <div class="skip-text">{row.error}</div>
      {:else}
        <div class="msg-preview">{row.message_text}</div>
      {/if}
    {/if}
  </td>
  <td class="device">{row.device || '—'}</td>
</tr>

<style>
  tr {
    border-bottom: 1px solid var(--border);
    cursor: pointer;
  }
  tr:hover {
    background: var(--panel);
  }
  tr.rail-sent {
    box-shadow: inset 3px 0 0 var(--sent);
  }
  tr.rail-skipped {
    box-shadow: inset 3px 0 0 var(--skipped);
  }
  tr.rail-failed {
    box-shadow: inset 3px 0 0 var(--failed);
  }
  td {
    padding: 10px;
    vertical-align: top;
  }
  .time {
    font-family: var(--mono);
    color: var(--muted);
    white-space: nowrap;
    font-size: 12.5px;
  }
  .type-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 5px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    white-space: nowrap;
  }
  .dash {
    color: var(--muted);
  }
  .device {
    color: var(--muted);
    font-family: var(--mono);
    font-size: 12.5px;
  }
  .msg-preview {
    color: var(--muted);
    font-family: var(--mono);
    font-size: 12px;
    max-width: 480px;
    white-space: pre-wrap;
    margin-top: 8px;
  }
  .error-text {
    color: var(--failed);
    font-family: var(--mono);
    font-size: 12px;
    margin-top: 8px;
  }
  .skip-text {
    color: var(--skipped);
    font-family: var(--mono);
    font-size: 12px;
    margin-top: 8px;
  }
</style>
