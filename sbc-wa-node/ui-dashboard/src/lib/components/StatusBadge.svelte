<script>
  /** @type {{ status: 'SENT' | 'SKIPPED' | 'FAILED', showDot?: boolean }} */
  let { status, showDot = false } = $props();

  const colorVar = { SENT: '--sent', SKIPPED: '--skipped', FAILED: '--failed' }[status];
</script>

<span class="badge" style="color: var({colorVar})">
  {#if showDot}<span class="dot" style="background: var({colorVar})"></span>{/if}
  {status}
</span>

<style>
  .badge {
    font-size: 11.5px;
    font-weight: 650;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
</style>
