<script>
  let now = $state(new Date());

  $effect(() => {
    const id = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(id);
  });

  let display = $derived(
    now.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Kuala_Lumpur' }) + ' MYT'
  );
</script>

<span class="clock">{display}</span>

<style>
  .clock {
    font-family: var(--mono);
    color: var(--muted);
    font-size: 12.5px;
  }
</style>
