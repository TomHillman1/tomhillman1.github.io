<script lang="ts">
  import { onMount } from 'svelte';
  import type { Vinyl } from '../helpers/models';
  import { getRecords, getSignedURL } from '../helpers/api';
  import { goto } from '../helpers/router';
    import { Search } from '@lucide/svelte';

  type VinylRow = Vinyl & { coverSignedUrl?: string | null };
  let loading = true, errorMsg = '', records: VinylRow[] = [];
  let filteredRecords: VinylRow[] = [];
  $: filteredRecords = records;

  onMount(async () => {
    const data = await getRecords();
    records = await Promise.all(
      (data ?? []).map(async r => ({ ...r, coverSignedUrl: await getSignedURL(r.cover_url) }))
    );
    loading = false;
  });

  function openRecord(id: string) {
    goto({ page: 'record', params: { id } }); // -> #/record/<id>
  }

  const onSearch = (e: Event) => {
    const q = (e.target as HTMLInputElement).value.toLowerCase();
    filteredRecords = records.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || (t.year?.toString().includes(q) ?? false));
  };

</script>

<section>
  <h1 class = "mb-[1rem]">My Vinyl Collection</h1>
  <div class="hint">A Digitised collection of all of my amazing vinyl.</div>
  <div class="input-group grid-cols-[auto_1fr_auto] mt-1 mb-1 w-sm">
    <div class="ig-cell preset-tonal">
      <Search size={16} />
    </div>
    <input on:input={onSearch} class="ig-input" type="search" placeholder="Search..." />
  </div>
  <div class="tabler-wrap max-w-6xl">
    <div class="max-h-[60rem] overflow-y-auto overflow-x-auto rounded-lg shadow-sm pb-2">
      <table class="table caption-bottom min-w-full">
          <thead
            class="sticky top-0 z-10
                  bg-surface-100/80 dark:bg-surface-800/80
                  backdrop-blur supports-[backdrop-filter]:bg-surface-100/60 dark:supports-[backdrop-filter]:bg-surface-800/60">
          <tr>
            <th>Cover</th>
            <th>Title</th>
            <th>Artist</th>
            <th>Year</th>
            <th>Genre</th>
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr><td colspan="4">Loading…</td></tr>
          {:else if errorMsg}
            <tr><td colspan="4">{errorMsg}</td></tr>
          {:else if !records.length}
            <tr><td colspan="4">No records yet.</td></tr>
          {:else}
            {#each filteredRecords as r}
              <tr class="cursor-pointer hover:bg-surface-100/80 hover:dark:bg-surface-800/80"
                  on:click={() => openRecord(r.id)}>
                <td>
                  {#if r.coverSignedUrl}
                    <img class="thumb" src={r.coverSignedUrl} alt={`Cover of ${r.title}`} />
                  {:else}
                    <div style="width:80px;height:80px;border-radius:6px;background:#eee;"></div>
                  {/if}
                </td>
                <td class="text-left font-bold">{r.title}</td>
                <td class="text-left">{r.artist}</td>
                <td class="text-left">{r.year ?? ''}</td>
                <td class="text-left">{r.genre ?? ''}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
    {#if loading}
      <p class="pl-2 text-left dark:text-surface-200">Loading…</p>
    {:else}
    <p class="pl-2 text-left dark:text-surface-200">
        {records.length + " records found"}
    </p>
    <div class="h-8"></div>
    {/if}
    
  </div>
</section>


<style>
  .hint { color:#666; margin: .25rem 0 1rem; font-size: .95rem; }
  img.thumb { width: 80x; height: 80px; object-fit: cover; border-radius: 6px; background:#f3f3f3; display:block; }

  @media (max-width: 640px) {
    th:nth-child(4), td:nth-child(4) { display:none; }
    th:nth-child(5), td:nth-child(5) { display:none; }
  }
</style>  