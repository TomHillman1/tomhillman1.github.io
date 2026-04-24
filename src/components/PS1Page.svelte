<script lang="ts">
  import { onMount } from 'svelte';
  import PS13DView from './PS13DView.svelte';
  import PS1Table from './PS1Table.svelte';
  import type { PS1Row } from '../helpers/models';
  import { getPS1Games, getSignedURL } from '../helpers/api';

  let loading = true, errorMsg = '';
  let games: PS1Row[] = [];

  onMount(async () => {
    try {
      const data = await getPS1Games();
      games = await Promise.all(
        (data ?? []).map(async g => {
          const [frontSignedUrl, backSignedUrl, sideSignedUrl] = await Promise.all([
            getSignedURL(g.coverFront),
            getSignedURL(g.coverBack),
            getSignedURL(g.coverSide)
          ]);
          return { ...g, frontSignedUrl, backSignedUrl, sideSignedUrl };
        })
      );
    } catch (err) {
      console.error('Failed to load PS1 games:', err);
      errorMsg = 'Failed to load games.';
    } finally {
      loading = false;
    }
  });
</script>

<section>
  <h1 class="mb-[1rem]">PS1 Games</h1>
  <div class="hint text-surface-600 dark:text-surface-200">A digitized collection of my PlayStation 1 games.</div>
  {#if loading}
    <p>Loading...</p>
  {:else if errorMsg}
    <p>{errorMsg}</p>
  {:else if !games.length}
    <p>No games found.</p>
  {:else}
    <PS13DView games={games.map(g => ({
      id: g.id,
      name: g.name,
      frontUrl: g.frontSignedUrl,
      backUrl: g.backSignedUrl,
      sideUrl: g.sideSignedUrl
    }))} />
    <!-- <PS1Table {games}/> -->
  {/if}
</section>
