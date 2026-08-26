<script>
  /** @type {{ label: string, columnKey: string, sortBy: string, sortDir: string, onSort: (key: string) => void, width?: string }} */
  let { label, columnKey, sortBy, sortDir, onSort, width = null } = $props();

  let isActive = $derived(sortBy === columnKey);
</script>

<th style={width ? `width: ${width}` : ''}>
  <button type="button" class="sort-btn" class:active={isActive} onclick={() => onSort(columnKey)}>
    {label}
    <span class="arrow" class:visible={isActive}>{sortDir === 'asc' ? '▲' : '▼'}</span>
  </button>
</th>

<style>
  th {
    text-align: left;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
  }
  .sort-btn {
    background: none;
    border: none;
    padding: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-weight: 600;
    cursor: pointer;
    font-family: var(--sans);
  }
  .sort-btn:hover,
  .sort-btn.active {
    color: var(--text);
  }
  .arrow {
    font-size: 9px;
    visibility: hidden;
  }
  .arrow.visible {
    visibility: visible;
    color: var(--accent);
  }
</style>
