<script lang="ts">
  import type { PS1Row } from '../helpers/models';
  import { Search } from '@lucide/svelte';

  export let games: PS1Row[] = [];
  let filteredGames: PS1Row[] = [];
  $: filteredGames = games;

  const formatRelease = (release?: string | null) => {
    if (!release) return '';
    const match = release.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return release;
    return `${match[3]}/${match[2]}/${match[1]}`;
  };
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
  <h1 class="mb-[1rem]">PS1 Games</h1>
  <div class="hint text-surface-600 dark:text-surface-200">A digitized collection of my PlayStation 1 games.</div>
  <div class="flex-row gap-2 mb-2 flex flex-wrap">
    <div class="input-group grid-cols-[auto_1fr_auto] mt-1 mb-1 w-sm">
      <div class="ig-cell preset-tonal">
        <Search size={16} />
      </div>
      <input on:input={onSearch} class="ig-input" type="search" placeholder="Search..." />
    </div>
  </div>
  <div class="tabler-wrap max-w-6xl">
    <div class="max-h-[60rem] overflow-y-auto overflow-x-auto rounded-lg shadow-sm pb-2">
      <table class="table caption-bottom min-w-full">
          <thead
            class="sticky top-0 z-10
                  bg-surface-100/80 dark:bg-surface-800/80
                  backdrop-blur supports-[backdrop-filter]:bg-surface-100/60 dark:supports-[backdrop-filter]:bg-surface-800/60">
          <tr>
            <th>Front</th>
            <th>Back</th>
            <th>Serial</th>
            <th>Title</th>
            <th>Release</th>
            <th>Year</th>
            <th>Genre</th>
            <th>Developer</th>
            <th>Publisher</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredGames as g}
            <tr>
              <td>
                {#if g.frontSignedUrl}
                  <img class="thumb" src={g.frontSignedUrl} alt={`Front cover of ${g.name}`} />
                {:else}
                  <div class="thumb-placeholder"></div>
                {/if}
              </td>
              <td>
                {#if g.backSignedUrl}
                  <img class="thumb" src={g.backSignedUrl} alt={`Back cover of ${g.name}`} />
                {:else}
                  <div class="thumb-placeholder"></div>
                {/if}
              </td>
              <td class="text-left font-mono text-xs">{g.id}</td>
              <td class="text-left font-bold">{g.name}</td>
              <td class="text-left">{formatRelease(g.release)}</td>
              <td class="text-left">{g.year ?? ''}</td>
              <td class="text-left">{g.genre.join(', ')}</td>
              <td class="text-left">{g.developer ?? ''}</td>
              <td class="text-left">{g.publisher ?? ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="pl-2 text-left dark:text-surface-200">
        {games.length + " games found"}
    </p>
    <div class="h-8"></div>
  </div>
</section>

<style>
  .hint { margin: .25rem 0 1rem; font-size: 1.5rem; }
  img.thumb { width: 80px; height: 80px; object-fit: cover; border-radius: 6px; background:#f3f3f3; display:block; }
  .thumb-placeholder { width: 80px; height: 80px; border-radius: 6px; background:#eee; }

  @media (max-width: 640px) {
    th:nth-child(2), td:nth-child(2) { display:none; }
    th:nth-child(5), td:nth-child(5) { display:none; }
    th:nth-child(8), td:nth-child(8) { display:none; }
    th:nth-child(9), td:nth-child(9) { display:none; }
  }
</style>
