<script>
  /** @type {{ page: number, pageSize: number, total: number, onPageChange: (p: number) => void }} */
  let { page, pageSize, total, onPageChange } = $props();

  let totalPages = $derived(Math.max(Math.ceil(total / pageSize), 1));
  let rangeStart = $derived(total === 0 ? 0 : (page - 1) * pageSize + 1);
  let rangeEnd = $derived(Math.min(page * pageSize, total));

  // Windowed page numbers: current page ± 2, always including first/last.
  let pageNumbers = $derived.by(() => {
    const nums = new Set([1, totalPages, page - 2, page - 1, page, page + 1, page + 2]);
    return [...nums].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  });
</script>

<div class="pagination">
  <span class="range">{rangeStart}–{rangeEnd} of {total}</span>

  <div class="controls">
    <button class="nav" disabled={page <= 1} onclick={() => onPageChange(page - 1)}>‹ Prev</button>

    {#each pageNumbers as n, i (n)}
      {#if i > 0 && n - pageNumbers[i - 1] > 1}
        <span class="ellipsis">…</span>
      {/if}
      <button class="page-num" class:active={n === page} onclick={() => onPageChange(n)}>{n}</button>
    {/each}

    <button class="nav" disabled={page >= totalPages} onclick={() => onPageChange(page + 1)}>Next ›</button>
  </div>
</div>

<style>
  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 28px 30px;
    flex-wrap: wrap;
    gap: 10px;
  }
  .range {
    color: var(--muted);
    font-size: 12.5px;
    font-family: var(--mono);
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  button {
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12.5px;
    cursor: pointer;
    font-family: var(--sans);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  button.page-num.active {
    background: var(--accent);
    color: #0c1220;
    border-color: var(--accent);
    font-weight: 650;
  }
  .ellipsis {
    color: var(--muted);
    padding: 0 4px;
  }
</style>
