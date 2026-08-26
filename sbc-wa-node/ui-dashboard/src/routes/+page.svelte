<script>
  import { fetchAlerts, fetchTenants, fetchSummary } from '$lib/api.js';
  import { ALERT_TYPES } from '$lib/constants.js';
  import SummaryCard from '$lib/components/SummaryCard.svelte';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import AlertTable from '$lib/components/AlertTable.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import Clock from '$lib/components/Clock.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';

  const PAGE_SIZE = 10;

  let rows = $state([]);
  let total = $state(0);
  let tenants = $state([]);
  let summary = $state({});
  let filters = $state({ type: '', tenant: '', status: '', from: '', to: '' });
  let sortBy = $state('created_at');
  let sortDir = $state('desc');
  let page = $state(1);
  let autoRefresh = $state(true);

  // Each data source gets its own error slot — a failed tenant fetch
  // shouldn't hide a perfectly good alerts table, and vice versa.
  let alertsError = $state(null);
  let tenantsError = $state(null);
  let tenantsWarning = $state(null);
  let summaryError = $state(null);

  async function loadAlerts() {
    try {
      const result = await fetchAlerts({ ...filters, sortBy, sortDir, page, pageSize: PAGE_SIZE });
      rows = result.rows;
      total = result.total;
      alertsError = null;
    } catch (err) {
      alertsError = err.message;
    }
  }

  async function loadTenants() {
    try {
      const result = await fetchTenants();
      tenants = result.tenants;
      tenantsWarning = result.warning || null;
      tenantsError = null;
    } catch (err) {
      tenantsError = err.message;
    }
  }

  async function loadSummary() {
    try {
      summary = await fetchSummary();
      summaryError = null;
    } catch (err) {
      summaryError = err.message;
    }
  }

  function refreshAll() {
    loadAlerts();
    loadTenants();
    loadSummary();
  }

  function applyFilters(newFilters) {
    filters = newFilters;
    page = 1;
    loadAlerts();
  }

  function clearFilters() {
    filters = { type: '', tenant: '', status: '', from: '', to: '' };
    page = 1;
    loadAlerts();
  }

  function filterByTenant(name) {
    filters = { ...filters, tenant: name };
    page = 1;
    loadAlerts();
  }

  function handleSort(columnKey) {
    if (sortBy === columnKey) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = columnKey;
      sortDir = 'desc';
    }
    page = 1;
    loadAlerts();
  }

  function goToPage(n) {
    page = n;
    loadAlerts();
  }

  $effect(() => {
    refreshAll();
    const id = setInterval(() => {
      if (autoRefresh) refreshAll();
    }, 30000);
    return () => clearInterval(id);
  });
</script>

<svelte:head>
  <title>Lorry System — Alert Log</title>
</svelte:head>

<header>
  <h1>LORRY SYSTEM <span class="dim">/ Alert Log</span></h1>
  <Clock />
</header>

<div class="cards">
  {#each ALERT_TYPES as t (t.key)}
    <SummaryCard label={t.label} counts={summary[t.key] || { SENT: 0, SKIPPED: 0, FAILED: 0 }} />
  {/each}
</div>
{#if summaryError}
  <div class="banner-wrap"><ErrorBanner message={`Summary cards: ${summaryError}`} /></div>
{/if}

{#if tenantsWarning}
  <div class="banner-wrap"><ErrorBanner message={tenantsWarning} variant="warning" /></div>
{/if}
{#if tenantsError}
  <div class="banner-wrap"><ErrorBanner message={`Tenant list: ${tenantsError}`} /></div>
{/if}

<FilterBar
  {tenants}
  {filters}
  onApply={applyFilters}
  onClear={clearFilters}
  {autoRefresh}
  onAutoRefreshChange={(v) => (autoRefresh = v)}
/>

{#if alertsError}
  <div class="banner-wrap"><ErrorBanner message={`Couldn't load alerts: ${alertsError}`} /></div>
{:else}
  <AlertTable {rows} {sortBy} {sortDir} onSort={handleSort} onTenantClick={filterByTenant} />
  <Pagination {page} pageSize={PAGE_SIZE} {total} onPageChange={goToPage} />
{/if}

<style>
  header {
    padding: 20px 28px 16px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  h1 {
    font-size: 17px;
    font-weight: 650;
    letter-spacing: 0.01em;
    margin: 0;
  }
  h1 .dim {
    color: var(--muted);
    font-weight: 500;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    padding: 20px 28px 4px;
  }
  .banner-wrap {
    margin: 12px 28px 0;
  }
  @media (max-width: 900px) {
    .cards {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
