<script lang="ts">
  import { onMount } from 'svelte';
  import PS13DView from './PS13DView.svelte';
  import PS1Table from './PS1Table.svelte';
  import type { PS1Row } from '../helpers/models';
  import { getPS1Games, getSignedURL } from '../helpers/api';
    import Professional from './Professional.svelte';

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
  <div class="hint text-surface-600 dark:text-surface-200 pb-8">A digitized collection of my PlayStation 1 games.</div>
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
  <div class="my-4 w-full text-left">
    <b>Controls:</b>
    <ul class="list-disc pl-6">
      <li>WASD/Arrows: Move Camera</li>
      <li>Left Click: Select Game</li>
      <li>Scroll Wheel: Zoom/Unzoom</li>
    </ul>
  </div>
  <footer class="my-4 w-full text-left text-sm text-surface-600 dark:text-surface-200">
    <p class="text-sm text-surface-600 dark:text-surface-200">
      PS1 game data sourced from <a href="https://psxdatacenter.com/" target="_blank" class="underline">PSX Data Center</a>. 
      PS1 box art sourced from 
      <a href="https://gamefaqs.gamespot.com/" target="_blank" class="underline">GameFAQs</a>,  
      <a href="https://gamesdb.launchbox-app.com/games/" target="_blank" class="underline">LaunchBox Games Database</a>, and
      <a href="https://www.mobygames.com/" target="_blank" class="underline">Moby Games</a>
    </p>
    <p> <a href="https://skfb.ly/6XDPA" target="_blank" class="underline">"Bookshelf"</a> by KurtSteiner is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).</p>
    <p> <a href="https://skfb.ly/oZB7M" target="_blank" class="underline">"NOKIA 6230"</a> by yanix is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).</p>
    <p> <a href="https://skfb.ly/6SsxK" target="_blank" class="underline">"Game Boy Color"</a> by MaximePages is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/). </p>
    <p> <a href="https://skfb.ly/pnIPX" target="_blank" class="underline">"Sony Discman D-181"</a> by yanix is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).</p>
    <p> <a href="https://skfb.ly/oFLY9" target="_blank" class="underline">"Tamagotchi"</a> by N01516 is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).</p>
  </footer>
</section>
