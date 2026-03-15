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
          const [frontSignedUrl, backSignedUrl] = await Promise.all([
            getSignedURL(g.coverFront),
            getSignedURL(g.coverBack)
          ]);
          return { ...g, frontSignedUrl, backSignedUrl };
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
  {#if loading}
    <p>Loading...</p>
  {:else if errorMsg}
    <p>{errorMsg}</p>
  {:else if !games.length}
    <p>No games yet.</p>
  {:else}
    <!-- <PS13DView games={games.map(g => ({ id: g.id, frontUrl: g.frontSignedUrl, backUrl: g.backSignedUrl }))} /> -->
    <PS1Table {games}/>
  {/if}
</section>
