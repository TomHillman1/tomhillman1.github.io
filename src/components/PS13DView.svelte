<script lang="ts">
  import { onMount } from 'svelte';
  import { LoaderCircle, Pause, Play, Volume2, VolumeX } from '@lucide/svelte';
  import { getTagSongSignedURL } from '../helpers/api';
  import PS1LoadingOverlay from './PS1LoadingOverlay.svelte';
  import {
    PS1_GAME_PRESS_EVENT,
    PS1_LOADING_PROGRESS_EVENT,
    PS1_SELECTION_CHANGE_EVENT,
    Ps1ShelfScene,
    type ShelfGamePressDetail,
    type ShelfGame,
    type ShelfLoadingProgressDetail,
    type ShelfSelectionChangeDetail,
    type ShelfView
  } from './3d/Ps1ShelfScene';

  export let games: ShelfGame[] = [];
  export let fetchLoading = false;

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
  let mounted = false;
  let overlayActive = true;
  let overlayProgress = 0;
  let overlayLoaded = 0;
  let overlayTotal = 1;
  let overlayStatusText: string | null = null;
  let overlayCountText: string | null = null;
  let audioEl: HTMLAudioElement | null = null;
  let musicVolume = 0.7;
  let musicMuted = false;
  let musicPlaying = false;
  let musicLoading = false;
  let musicTrackUrl: string | null = null;
  let musicTrackGameId: string | null = null;
  let musicPlaybackError = '';
  let musicRequestId = 0;
  let musicAudible = true;
  let canUseMusicControls = false;
  const tagSongUrlCache = new Map<string, string | null>();

  function createScene() {
    if (!container || scene) return;
    scene = new Ps1ShelfScene(container, games);
    currentView = scene.getView();
  }

  function destroyScene() {
    scene?.destroy();
    scene = null;
    currentView = 'front';
    selectedGame = null;
    loadingActive = true;
    loadingProgress = 0;
    loadingLoaded = 0;
    loadingTotal = 1;
  }

  function pauseMusic() {
    audioEl?.pause();
  }

  async function playCurrentMusic() {
    if (!audioEl) return;

    if (!musicTrackUrl && selectedGame) {
      await loadAndPlayTagSong(selectedGame);
      return;
    }

    if (!musicTrackUrl) return;

    try {
      musicPlaybackError = '';
      await audioEl.play();
    } catch (err) {
      musicPlaybackError = 'Playback blocked. Press play to start music.';
      musicPlaying = false;
      console.warn('Failed to play tag song.', err);
    }
  }

  async function toggleMusicPlayback() {
    if (musicPlaying) {
      pauseMusic();
      return;
    }

    await playCurrentMusic();
  }

  function toggleMusicMute() {
    musicMuted = !musicMuted;
  }

  function handleVolumeInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    musicVolume = Number(input.value);
    if (musicVolume > 0 && musicMuted) {
      musicMuted = false;
    }
  }

  async function loadAndPlayTagSong(game: ShelfGame) {
    if (!audioEl) return;

    const requestId = ++musicRequestId;
    musicLoading = true;
    musicPlaybackError = '';

    try {
      let url = tagSongUrlCache.get(game.id);
      if (url === undefined) {
        url = await getTagSongSignedURL(game.id);
        tagSongUrlCache.set(game.id, url);
      }

      if (requestId !== musicRequestId) return;

      if (!url) {
        musicTrackUrl = null;
        musicTrackGameId = null;
        pauseMusic();
        musicPlaybackError = 'No tag song found for this game.';
        return;
      }

      const isSameTrack = musicTrackGameId === game.id && musicTrackUrl === url;
      musicTrackGameId = game.id;
      musicTrackUrl = url;

      if (!isSameTrack) {
        audioEl.src = url;
        audioEl.currentTime = 0;
      }

      await playCurrentMusic();
    } catch (err) {
      if (requestId !== musicRequestId) return;
      pauseMusic();
      musicPlaybackError = 'Could not load this tag song.';
      console.warn('Failed to load tag song.', err);
    } finally {
      if (requestId === musicRequestId) {
        musicLoading = false;
      }
    }
  }

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
      if (!selectedGame) pauseMusic();
    };
    const onGamePress = (event: Event) => {
      const game = (event as CustomEvent<ShelfGamePressDetail>).detail.game;
      void loadAndPlayTagSong(game);
    };
    const onLoadingProgress = (event: Event) => {
      const detail = (event as CustomEvent<ShelfLoadingProgressDetail>).detail;
      loadingActive = detail.active;
      loadingProgress = detail.progress;
      loadingLoaded = detail.loaded;
      loadingTotal = detail.total;
    };

    container.addEventListener(PS1_SELECTION_CHANGE_EVENT, onSelectionChange);
    container.addEventListener(PS1_GAME_PRESS_EVENT, onGamePress);
    container.addEventListener(PS1_LOADING_PROGRESS_EVENT, onLoadingProgress);
    document.addEventListener('fullscreenchange', syncFullscreenState);
    mounted = true;
    syncFullscreenState();
    return () => {
      mounted = false;
      container?.removeEventListener(PS1_SELECTION_CHANGE_EVENT, onSelectionChange);
      container?.removeEventListener(PS1_GAME_PRESS_EVENT, onGamePress);
      container?.removeEventListener(PS1_LOADING_PROGRESS_EVENT, onLoadingProgress);
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      pauseMusic();
      destroyScene();
    };
  });

  $: if (mounted && container && !scene && !fetchLoading) {
    createScene();
  }

  $: if (scene) scene.setGames(games);

  $: overlayActive = fetchLoading || !scene || loadingActive;
  $: overlayProgress = fetchLoading ? 0 : loadingProgress;
  $: overlayLoaded = fetchLoading ? 0 : loadingLoaded;
  $: overlayTotal = fetchLoading ? 0 : loadingTotal;
  $: overlayStatusText = fetchLoading ? 'Loading game library...' : null;
  $: overlayCountText = fetchLoading ? 'Fetching metadata and cover URLs' : null;
  $: if (audioEl) {
    audioEl.volume = musicVolume;
    audioEl.muted = musicMuted || musicVolume <= 0;
  }
  $: musicAudible = !musicMuted && musicVolume > 0;
  $: canUseMusicControls = Boolean(selectedGame || musicTrackUrl) && !musicLoading;


</script>

<section class="ps1-3d">
  <div class="viewport" bind:this={viewportEl}>
    <PS1LoadingOverlay
      active={overlayActive}
      progress={overlayProgress}
      loaded={overlayLoaded}
      total={overlayTotal}
      statusText={overlayStatusText}
      countText={overlayCountText}
    />
    <button class="fullscreen-toggle" type="button" on:click={toggleFullscreen}>
      {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
    </button>
    <div class="music-controls">
      <button
        aria-label={musicPlaying ? 'Pause tag song' : 'Play tag song'}
        class="music-button"
        disabled={!canUseMusicControls}
        title={musicPlaybackError || (musicPlaying ? 'Pause tag song' : 'Play tag song')}
        type="button"
        on:click={toggleMusicPlayback}
      >
        {#if musicLoading}
          <span class="spin">
            <LoaderCircle size={17} />
          </span>
        {:else if musicPlaying}
          <Pause size={17} />
        {:else}
          <Play size={17} />
        {/if}
      </button>
      <button
        aria-label={musicAudible ? 'Mute tag song' : 'Unmute tag song'}
        class="music-button"
        title={musicAudible ? 'Mute tag song' : 'Unmute tag song'}
        type="button"
        on:click={toggleMusicMute}
      >
        {#if musicAudible}
          <Volume2 size={17} />
        {:else}
          <VolumeX size={17} />
        {/if}
      </button>
      <input
        aria-label="Tag song volume"
        class="volume-slider"
        max="1"
        min="0"
        step="0.01"
        type="range"
        value={musicVolume}
        on:input={handleVolumeInput}
      />
    </div>
    {#if selectedGame}
      <div class="selection-overlay">
        Game selected: {selectedGame.name}
      </div>
    {/if}
    <audio
      bind:this={audioEl}
      preload="none"
      on:ended={() => musicPlaying = false}
      on:error={() => {
        musicPlaying = false;
        musicPlaybackError = 'Could not play this tag song.';
      }}
      on:pause={() => musicPlaying = false}
      on:play={() => musicPlaying = true}
    ></audio>
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
  .music-controls {
    position: absolute;
    left: 1rem;
    bottom: 1rem;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.6rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    backdrop-filter: blur(12px);
  }
  .music-button {
    display: grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    cursor: pointer;
  }
  .music-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  .volume-slider {
    width: min(8rem, 24vw);
    accent-color: #46d6cf;
    cursor: pointer;
  }
  .spin {
    display: grid;
    place-items: center;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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

  @media (max-width: 640px) {
    .music-controls {
      right: 1rem;
    }

    .volume-slider {
      width: min(7rem, 34vw);
    }
  }
</style>
