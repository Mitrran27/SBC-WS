<script>
  /** @type {{ name: string, count?: number, onclick?: () => void }} */
  let { name, count = null, onclick = null } = $props();
</script>

<button
  type="button"
  class="pill"
  class:clickable={!!onclick}
  onclick={(e) => { e.stopPropagation(); onclick?.(); }}
  disabled={!onclick}
>
  {name}{#if count !== null} ({count}){/if}
</button>

<style>
  .pill {
    display: inline-block;
    font-size: 11.5px;
    font-family: var(--sans);
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(91, 141, 239, 0.12);
    color: var(--accent);
    margin: 1px 3px 1px 0;
    border: none;
  }
  .pill.clickable {
    cursor: pointer;
  }
  .pill.clickable:hover {
    background: rgba(91, 141, 239, 0.22);
  }
  .pill:disabled {
    cursor: default;
  }
</style>
