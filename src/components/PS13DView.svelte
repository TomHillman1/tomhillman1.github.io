<script lang="ts">
  import { onMount } from 'svelte';
  import {
    PS1_SELECTION_CHANGE_EVENT,
    Ps1ShelfScene,
    type ShelfGame,
    type ShelfSelectionChangeDetail,
    type ShelfView
  } from './3d/Ps1ShelfScene';

  export let games: ShelfGame[] = [];

  let container: HTMLDivElement | null = null;
  let scene: Ps1ShelfScene | null = null;
  let currentView: ShelfView = 'front';
  let selectedGame: ShelfGame | null = null;

  onMount(() => {
    if (!container) return;

    const onSelectionChange = (event: Event) => {
      selectedGame = (event as CustomEvent<ShelfSelectionChangeDetail>).detail.game;
    };

    container.addEventListener(PS1_SELECTION_CHANGE_EVENT, onSelectionChange);
    scene = new Ps1ShelfScene(container, games);
    currentView = scene.getView();
    return () => {
      container?.removeEventListener(PS1_SELECTION_CHANGE_EVENT, onSelectionChange);
      scene?.destroy();
    };
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
  <div class="viewport">
    {#if selectedGame}
      <div class="selection-overlay">
        Game selected: {selectedGame.name}
      </div>
    {/if}
    <div class="stage" bind:this={container}></div>
  </div>
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
  .viewport {
    position: relative;
  }
  .selection-overlay {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: 1;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    background: rgba(17, 24, 39, 0.85);
    color: #fff;
    pointer-events: none;
  }
  .stage {
    width: 100%;
    height: 480px;
    border-radius: 12px;
    overflow: hidden;
  }
</style>
