<script lang="ts">
  import { onMount } from 'svelte';
  import { Ps1ShelfScene, type ShelfGame } from './3d/Ps1ShelfScene';

  export let games: ShelfGame[] = [];

  let container: HTMLDivElement | null = null;
  let scene: Ps1ShelfScene | null = null;

  onMount(() => {
    if (!container) return;
    scene = new Ps1ShelfScene(container, games);
    return () => scene?.destroy();
  });

  $: if (scene) scene.setGames(games);
</script>

<section class="ps1-3d">
  <div class="stage" bind:this={container}></div>
</section>

<style>
  .ps1-3d {
    width: 100%;
  }
  .stage {
    width: 100%;
    height: 320px;
    border-radius: 12px;
    overflow: hidden;
  }
</style>
