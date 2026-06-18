<script lang="ts">
  import { onMount } from 'svelte';
  import PS1LoadingOverlay from './PS1LoadingOverlay.svelte';
  import {
    PS1_LOADING_PROGRESS_EVENT,
    PS1_SELECTION_CHANGE_EVENT,
    Ps1ShelfScene,
    type ShelfGame,
    type ShelfLoadingProgressDetail,
    type ShelfSelectionChangeDetail,
    type ShelfView
  } from './3d/Ps1ShelfScene';

  export let games: ShelfGame[] = [];

  let container: HTMLDivElement | null = null;
  let viewportEl: HTMLDivElement | null = null;
  let scene: Ps1ShelfScene | null = null;
  let currentView: ShelfView = 'front';
  let selectedGame: ShelfGame | null = null;
  let loadingActive = true;
  let loadingProgress = 0;
  let loadingLoaded = 0;
  let loadingTotal = 1;
  let isFullscreen = false;

  async function toggleFullscreen() {
    if (!viewportEl) return;

    try {
      if (document.fullscreenElement === viewportEl) {
        await document.exitFullscreen();
      } else {
        await viewportEl.requestFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen toggle failed.', err);
    }
  }

  function syncFullscreenState() {
    isFullscreen = document.fullscreenElement === viewportEl;
    window.dispatchEvent(new Event('resize'));
  }

  onMount(() => {
    if (!container) return;

    const onSelectionChange = (event: Event) => {
      selectedGame = (event as CustomEvent<ShelfSelectionChangeDetail>).detail.game;
    };
    const onLoadingProgress = (event: Event) => {
      const detail = (event as CustomEvent<ShelfLoadingProgressDetail>).detail;
      loadingActive = detail.active;
      loadingProgress = detail.progress;
      loadingLoaded = detail.loaded;
      loadingTotal = detail.total;
    };

    container.addEventListener(PS1_SELECTION_CHANGE_EVENT, onSelectionChange);
    container.addEventListener(PS1_LOADING_PROGRESS_EVENT, onLoadingProgress);
    document.addEventListener('fullscreenchange', syncFullscreenState);
    scene = new Ps1ShelfScene(container, games);
    currentView = scene.getView();
    syncFullscreenState();
    return () => {
      container?.removeEventListener(PS1_SELECTION_CHANGE_EVENT, onSelectionChange);
      container?.removeEventListener(PS1_LOADING_PROGRESS_EVENT, onLoadingProgress);
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      scene?.destroy();
    };
  });

  $: if (scene) scene.setGames(games);


</script>

<section class="ps1-3d">
  <div class="viewport" bind:this={viewportEl}>
    <PS1LoadingOverlay
      active={loadingActive}
      progress={loadingProgress}
      loaded={loadingLoaded}
      total={loadingTotal}
    />
    <button class="fullscreen-toggle" type="button" on:click={toggleFullscreen}>
      {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
    </button>
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
  .viewport {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    overflow: hidden;
    background: #000;
  }
  .viewport:fullscreen {
    width: 100vw;
    height: 100vh;
    aspect-ratio: auto;
    border-radius: 0;
  }
  .fullscreen-toggle {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 2;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    padding: 0.55rem 0.9rem;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
    backdrop-filter: blur(12px);
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
    height: 100%;
  }
</style>
