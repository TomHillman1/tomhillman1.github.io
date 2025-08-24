<script lang="ts">
  import { onMount } from 'svelte';
  import type { Vinyl } from '../helpers/models';
  import { getRecords, getSignedCover } from '../helpers/api';

  let loading = true;
  let errorMsg = '';
  type VinylRow = Vinyl & { coverSignedUrl?: string | null };
  let records: VinylRow[] = [];


  onMount(async () => {
    const data = await getRecords();
    const rows = await Promise.all(
      (data ?? []).map(async r => ({ ...r, coverSignedUrl: await getSignedCover(r.cover_url) }))
    );

    records = rows;
    loading = false;
  });

</script>

<section>
  <h1>My Vinyl Collection</h1>
  <div class="hint">A Digitised collection of all of my amazing vinyl.</div>
  
  <div class="grid max-w-6xl mx-auto px-4">
    <table>
      <thead>
        <tr>
          <th>Cover</th>
          <th>Artist</th>
          <th>Title</th>
          <th>Year</th>
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
          {#each records as r}
            <tr>
              <td>
                {#if r.coverSignedUrl}
                  <img class="thumb" src={r.coverSignedUrl} alt={`Cover of ${r.title}`} />
                {:else}
                  <div style="width:64px;height:64px;border-radius:6px;background:#eee;"></div>
                {/if}
              </td>
              <td>{r.artist}</td>
              <td>{r.title}</td>
              <td>{r.year ?? ''}</td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</section>

<style>
  :root { --pad: 12px; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; }

  .wrap { padding: 2rem; }

  /* NEW: make text inside the white card dark so it shows up */
  .grid { overflow-x: auto; background: white; border: 1px solid #eee; border-radius: 10px; color: #111; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #eee; padding: var(--pad); text-align: left; vertical-align: middle; }
  th { background: #fafafa; position: sticky; top: 0; color: #333; } /* NEW */

  h1 { margin: 0 0 1rem; }
  .hint { color:#666; margin: .25rem 0 1rem; font-size: .95rem; }
  img.thumb { width: 64px; height: 64px; object-fit: cover; border-radius: 6px; background:#f3f3f3; display:block; }

  @media (max-width: 640px) {
    th:nth-child(4), td:nth-child(4) { display:none; }
  }
</style>