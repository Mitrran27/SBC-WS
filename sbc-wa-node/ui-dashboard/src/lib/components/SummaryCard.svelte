<script>
  import StatusBadge from './StatusBadge.svelte';

  /** @type {{ label: string, counts: { SENT: number, SKIPPED: number, FAILED: number } }} */
  let { label, counts } = $props();
</script>

<div class="card">
  <div class="label">{label} — 24h</div>
  <div class="rowline"><StatusBadge status="SENT" showDot /> <span class="count">{counts.SENT} sent</span></div>
  <div class="rowline"><StatusBadge status="SKIPPED" showDot /> <span class="count">{counts.SKIPPED} skipped</span></div>
  <div class="rowline"><StatusBadge status="FAILED" showDot /> <span class="count">{counts.FAILED} failed</span></div>
</div>

<style>
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .label {
    font-size: 11.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin-bottom: 10px;
  }
  .rowline {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--mono);
    font-size: 13px;
    margin-top: 6px;
  }
  .count {
    color: var(--text);
  }
</style>
