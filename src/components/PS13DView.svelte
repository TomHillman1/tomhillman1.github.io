<script lang="ts">
  import { onMount } from 'svelte';
  import type { PS1Game } from '../helpers/models';
  import { getPS1Games, getSignedURL } from '../helpers/api';
  import { Search } from '@lucide/svelte';

  type PS1Row = PS1Game & { frontSignedUrl?: string | null; backSignedUrl?: string | null };

  let loading = true, errorMsg = '', games: PS1Row[] = [];
  let filteredGames: PS1Row[] = [];
  $: filteredGames = games;

  const formatRelease = (release?: string | null) => {
    if (!release) return '';
    const match = release.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return release;
    return `${match[3]}/${match[2]}/${match[1]}`;
  };

  onMount(async () => {
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
    loading = false;
  });

  const onSearch = (e: Event) => {
    const q = (e.target as HTMLInputElement).value.toLowerCase();
    filteredGames = games.filter(g =>
      g.name.toLowerCase().includes(q) ||
      g.id.toLowerCase().includes(q) ||
      (g.genre.join(' ').toLowerCase().includes(q)) ||
      (g.developer?.toLowerCase().includes(q) ?? false) ||
      (g.publisher?.toLowerCase().includes(q) ?? false) ||
      (g.year?.toString().includes(q) ?? false) ||
      (g.release?.toString().includes(q) ?? false)
    );
  };
</script>

<section>
  
</section>

<style>

</style>
