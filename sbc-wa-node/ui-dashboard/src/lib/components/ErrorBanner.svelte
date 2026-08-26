<script>
  /** @type {{ message: string, variant?: 'error' | 'warning' }} */
  let { message, variant = 'error' } = $props();
</script>

<div class="banner {variant}">
  <span class="icon">{variant === 'error' ? '⛔' : '⚠️'}</span>
  <span>{message}</span>
</div>

<style>
  .banner {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.4;
  }
  .banner.error {
    background: rgba(241, 85, 76, 0.1);
    border: 1px solid var(--failed);
    color: var(--failed);
  }
  .banner.warning {
    background: rgba(240, 185, 77, 0.1);
    border: 1px solid var(--skipped);
    color: var(--skipped);
  }
  .icon {
    flex-shrink: 0;
  }
</style>
