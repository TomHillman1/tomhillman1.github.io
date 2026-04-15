<script lang="ts">
  import { onMount } from 'svelte';
  import { Ps1ShelfScene, type ShelfGame, type ShelfView } from './3d/Ps1ShelfScene';

  export let games: ShelfGame[] = [];

  let container: HTMLDivElement | null = null;
  let scene: Ps1ShelfScene | null = null;
  let currentView: ShelfView = 'front';

  onMount(() => {
    if (!container) return;
    scene = new Ps1ShelfScene(container, games);
    currentView = scene.getView();
    return () => scene?.destroy();
  });

  $: if (scene) scene.setGames(games);

  function rotateView() {
    if (!scene) return;
    currentView = scene.cycleView();
  }
</script>

<section class="ps1-3d">
  <div class="controls">
    <button type="button" on:click={rotateView}>Rotate</button>
    <span>View: {currentView}</span>
  </div>
  <div class="stage" bind:this={container}></div>
</section>

<style>
  .ps1-3d {
    width: 100%;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  button {
    border-radius: 6px;
    padding: 0.5rem 0.85rem;
  }
  .stage {
    width: 100%;
    height: 320px;
    border-radius: 12px;
    overflow: hidden;
  }
</style>
