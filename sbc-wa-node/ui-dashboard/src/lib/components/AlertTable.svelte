<script>
  import AlertRow from './AlertRow.svelte';
  import SortableHeader from './SortableHeader.svelte';

  /** @type {{ rows: object[], sortBy: string, sortDir: string, onSort: (key: string) => void, onTenantClick: (name: string) => void }} */
  let { rows, sortBy, sortDir, onSort, onTenantClick } = $props();
</script>

<table>
  <thead>
    <tr>
      <SortableHeader label="Time (MYT)" columnKey="created_at" {sortBy} {sortDir} {onSort} width="150px" />
      <SortableHeader label="Type" columnKey="alert_type" {sortBy} {sortDir} {onSort} width="150px" />
      <SortableHeader label="Status" columnKey="status" {sortBy} {sortDir} {onSort} width="110px" />
      <SortableHeader label="Tenant(s)" columnKey="tenant" {sortBy} {sortDir} {onSort} />
      <SortableHeader label="Device" columnKey="device" {sortBy} {sortDir} {onSort} width="140px" />
    </tr>
  </thead>
  <tbody>
    {#if rows.length === 0}
      <tr class="empty-row">
        <td colspan="5"><div class="empty">No alerts match these filters.</div></td>
      </tr>
    {:else}
      {#each rows as row (row.id)}
        <AlertRow {row} {onTenantClick} />
      {/each}
    {/if}
  </tbody>
</table>

<style>
  table {
    width: calc(100% - 56px);
    border-collapse: collapse;
    margin: 0 28px;
  }
  .empty-row {
    cursor: default;
  }
  .empty {
    text-align: center;
    color: var(--muted);
    padding: 60px 0;
  }
</style>
