<script lang="ts">
  import { onMount } from 'svelte';
  import { getTagSongSignedURL } from '../helpers/api';
  import AudioControl from './AudioControl.svelte';
  import PS1LoadingOverlay from './PS1LoadingOverlay.svelte';
  import crosshairUrl from '../assets/cursors/ps1-crosshair.svg?url';
  import handCursorUrl from '../assets/cursors/win98-hand.svg?url';
  import {
    PS1_GAME_PRESS_EVENT,
    PS1_LOADING_PROGRESS_EVENT,
    PS1_NAVIGATION_CHANGE_EVENT,
    PS1_HOVER_CHANGE_EVENT,
    PS1_SELECTION_CHANGE_EVENT,
    Ps1ShelfScene,
    type ShelfGamePressDetail,
    type ShelfGame,
    type ShelfLoadingProgressDetail,
    type Ps1NavigationChangeDetail,
    type ShelfSelectionChangeDetail,
    type ShelfHoverChangeDetail
  } from './3d/Ps1ShelfScene';

  export let games: ShelfGame[] = [];
  export let fetchLoading = false;

  let container: HTMLDivElement | null = null;
  let viewportEl: HTMLDivElement | null = null;
  let scene: Ps1ShelfScene | null = null;
  let selectedGame: ShelfGame | null = null;
  let hoveredGame: ShelfGame | null = null;
  let navigationLocked = false;
  let returningToRoom = false;
  let navigationError = '';
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
  }

  function destroyScene() {
    scene?.destroy();
    scene = null;
    selectedGame = null;
    hoveredGame = null;
    navigationLocked = false;
    returningToRoom = false;
    navigationError = '';
    loadingActive = true;
    loadingProgress = 0;
    loadingLoaded = 0;
    loadingTotal = 1;
  }

  function pauseMusic() {
    audioEl?.pause();
  }

  function clearSelectedMusic() {
    // Invalidate in-flight signing/playback before changing or leaving a game.
    musicRequestId += 1;
    musicLoading = false;
    musicTrackUrl = null;
    musicTrackGameId = null;
    musicPlaybackError = '';
    pauseMusic();
    audioEl?.removeAttribute('src');
    audioEl?.load();
  }

  async function playCurrentMusic() {
    if (!audioEl) return;

    if (!musicTrackUrl && selectedGame) {
      await loadAndPlayTagSong(selectedGame);
      return;
    }

    if (!musicTrackUrl) return;

    const requestId = musicRequestId;
    try {
      musicPlaybackError = '';
      await audioEl.play();
    } catch (err) {
      if (requestId !== musicRequestId) return;
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

  function handleMusicVolumeChange(event: CustomEvent<{ volume: number }>) {
    musicVolume = event.detail.volume;
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
      clearSelectedMusic();
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
    const onNavigationChange = (event: Event) => {
      const detail = (event as CustomEvent<Ps1NavigationChangeDetail>).detail;
      navigationLocked = detail.locked && detail.mode === 'navigate';
      returningToRoom = detail.returning;
      navigationError = detail.error;
    };
    const onHoverChange = (event: Event) => {
      hoveredGame = (event as CustomEvent<ShelfHoverChangeDetail>).detail.game;
    };

    container.addEventListener(PS1_SELECTION_CHANGE_EVENT, onSelectionChange);
    container.addEventListener(PS1_GAME_PRESS_EVENT, onGamePress);
    container.addEventListener(PS1_LOADING_PROGRESS_EVENT, onLoadingProgress);
    container.addEventListener(PS1_NAVIGATION_CHANGE_EVENT, onNavigationChange);
    container.addEventListener(PS1_HOVER_CHANGE_EVENT, onHoverChange);
    document.addEventListener('fullscreenchange', syncFullscreenState);
    mounted = true;
    syncFullscreenState();
    return () => {
      mounted = false;
      container?.removeEventListener(PS1_SELECTION_CHANGE_EVENT, onSelectionChange);
      container?.removeEventListener(PS1_GAME_PRESS_EVENT, onGamePress);
      container?.removeEventListener(PS1_LOADING_PROGRESS_EVENT, onLoadingProgress);
      container?.removeEventListener(PS1_NAVIGATION_CHANGE_EVENT, onNavigationChange);
      container?.removeEventListener(PS1_HOVER_CHANGE_EVENT, onHoverChange);
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      clearSelectedMusic();
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
  <div class="viewport" class:inspect-mode={Boolean(selectedGame)} bind:this={viewportEl}>
    <PS1LoadingOverlay
      active={overlayActive}
      progress={overlayProgress}
      loaded={overlayLoaded}
      total={overlayTotal}
      statusText={overlayStatusText}
      countText={overlayCountText}
    />
    {#if !overlayActive}
      <div class="scene-toolbar">
        <div class="scene-heading" aria-live="polite">
          <span class="scene-mode">{selectedGame ? 'Inspect View' : 'Navigate View'}</span>
          {#if selectedGame}
            <span class="game-title" title={selectedGame.name}>{selectedGame.name}</span>
          {/if}
        </div>
        <div class="scene-tools">
          <button class="fullscreen-toggle" type="button" on:click={toggleFullscreen}>
            {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
          {#if selectedGame}
            <button class="inspect-close" type="button" aria-label="Exit Inspect View" title="Return to room" on:click={() => scene?.exitInspection()}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 7 7" shape-rendering="crispEdges"><path fill="currentColor" d="M0 0h2v1h1v1h1V1h1V0h2v2H6v1H5v1h1v1h1v2H5V6H4V5H3v1H2v1H0V5h1V4h1V3H1V2H0z" /></svg>
            </button>
          {/if}
        </div>
      </div>
      {#if navigationLocked}
        <div class="navigation-crosshair" aria-hidden="true">
          {#if hoveredGame}
            <img class="target-hand" src={handCursorUrl} width="36" height="44" alt="" />
          {:else}
            <img class="target-cross" src={crosshairUrl} width="28" height="28" alt="" />
          {/if}
        </div>
        {#if hoveredGame}
          <div class="target-label" role="status"><span>{hoveredGame.name}</span><small>Click to inspect</small></div>
        {/if}
      {/if}
      <div class="scene-footer">
        <div class="audio-panel">
          <AudioControl
            disabled={!canUseMusicControls}
            loading={musicLoading}
            muted={!musicAudible}
            pauseLabel="Pause tag song"
            playbackError={musicPlaybackError}
            playing={musicPlaying}
            playLabel="Play tag song"
            muteLabel="Mute tag song"
            unmuteLabel="Unmute tag song"
            volume={musicVolume}
            volumeLabel="Tag song volume"
            on:toggleplayback={toggleMusicPlayback}
            on:togglemute={toggleMusicMute}
            on:volumechange={handleMusicVolumeChange}
          />
        </div>
        <div class="scene-actions">
          {#if navigationLocked}
            <p class="control-hint">WASD to walk &middot; Mouse to look<br />C toggles crouching &middot; Esc releases the mouse</p>
          {:else if selectedGame}
            <div class="inspection-buttons">
              <button type="button" disabled={games.length < 2} on:click={() => scene?.cycleSelection(-1)} aria-label="Inspect previous game">&larr; Previous</button>
              <button type="button" disabled={games.length < 2} on:click={() => scene?.cycleSelection(1)} aria-label="Inspect next game">Next &rarr;</button>
            </div>
            <p class="control-hint inspection-hint">Arrows change game; other keys exit.<br />Tab focuses controls.</p>
          {:else}
            <button class="navigation-start" type="button" disabled={returningToRoom} on:click={() => scene?.startNavigation()}>
              {returningToRoom ? 'Returning to room...' : 'Click to navigate'}
            </button>
            {#if navigationError}
              <p class="navigation-error" role="status">{navigationError}</p>
            {/if}
          {/if}
        </div>
      </div>
    {/if}
    <audio
      bind:this={audioEl}
      preload="none"
      on:ended={() => musicPlaying = false}
      on:error={() => {
        if (!selectedGame || !musicTrackUrl) return;
        musicPlaying = false;
        musicPlaybackError = 'Could not play this tag song.';
      }}
      on:pause={() => musicPlaying = false}
      on:play={() => musicPlaying = true}
    ></audio>
    <div class="stage" class:game-hovered={Boolean(hoveredGame)} bind:this={container}></div>
  </div>
</section>

<style>
  .ps1-3d {
    width: 100%;
    container-type: inline-size;
  }
  .viewport {
    --ps1-pointer: url('../assets/cursors/ps1-crosshair.svg') 14 14, crosshair;
    --ps1-hand: url('../assets/cursors/win98-hand.svg') 12 2, pointer;
    position: relative;
    container-type: inline-size;
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    overflow: hidden;
    background: #000;
    color: #f6f5ef;
  }
  .viewport:fullscreen {
    width: 100vw;
    height: 100vh;
    min-height: 0;
    aspect-ratio: auto;
    border-radius: 0;
  }
  .stage {
    width: 100%;
    height: 100%;
  }
  .stage :global(canvas) {
    display: block;
  }
  .viewport.inspect-mode {
    cursor: var(--ps1-pointer);
  }
  .viewport.inspect-mode :global(button:not(:disabled)),
  .viewport.inspect-mode :global(input[type='range']),
  .stage.game-hovered :global(canvas) {
    cursor: var(--ps1-hand);
  }
  .viewport button {
    border: 1px solid rgba(255, 255, 255, 0.45);
    border-radius: 4px;
    padding: 0.55rem 0.75rem;
    background: rgba(12, 15, 18, 0.9);
    color: inherit;
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .viewport button:hover:not(:disabled) {
    background: rgba(43, 49, 56, 0.96);
    border-color: #f2f5e9;
  }
  .viewport :global(button:focus-visible),
  .viewport :global(input:focus-visible),
  .stage :global(canvas:focus-visible) {
    outline: 2px solid #c9f1b5;
    outline-offset: 3px;
  }
  .stage :global(canvas:focus-visible) {
    outline-offset: -3px;
  }
  .viewport button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .scene-toolbar, .scene-footer {
    position: absolute;
    left: 0.75rem;
    right: 0.75rem;
    z-index: 2;
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    pointer-events: none;
  }
  .scene-toolbar {
    top: 0.75rem;
    align-items: flex-start;
  }
  .scene-heading {
    min-width: 0;
    padding: 0.5rem 0.65rem;
    border-radius: 4px;
    background: rgba(12, 15, 18, 0.84);
    line-height: 1.3;
  }
  .scene-mode {
    display: block;
    color: #c7d3c1;
    font: 0.62rem/1.4 monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .game-title {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    margin-top: 0.2rem;
    font-size: 0.82rem;
    overflow-wrap: anywhere;
  }
  .scene-tools {
    display: flex;
    flex-shrink: 0;
    align-items: stretch;
    gap: 0.5rem;
    pointer-events: auto;
  }
  .scene-tools .fullscreen-toggle {
    font-size: 0.65rem;
    white-space: nowrap;
  }
  .scene-tools .inspect-close {
    display: grid;
    place-items: center;
    width: 2.2rem;
    min-height: 2.2rem;
    padding: 0;
  }
  .scene-footer {
    bottom: 0.75rem;
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .audio-panel {
    pointer-events: auto;
    max-width: 100%;
  }
  .scene-actions {
    max-width: min(100%, 21rem);
    text-align: right;
  }
  .scene-actions button {
    pointer-events: auto;
  }
  .inspection-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .control-hint, .navigation-error {
    margin: 0.4rem 0 0;
    padding: 0.4rem 0.55rem;
    border-radius: 4px;
    background: rgba(12, 15, 18, 0.84);
    font-size: 0.65rem;
    line-height: 1.5;
  }
  .navigation-crosshair {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 2;
    width: 0;
    height: 0;
    pointer-events: none;
  }
  .navigation-crosshair img {
    max-width: none;
    image-rendering: pixelated;
  }
  .target-cross {
    transform: translate(-50%, -50%);
  }
  .target-hand {
    /* Align the index fingertip, not the palm, with the centre ray. */
    transform: translate(-12px, -2px);
  }
  .target-label {
    position: absolute;
    top: calc(50% + 3rem);
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    max-width: 70%;
    padding: 0.4rem 0.6rem;
    border-radius: 4px;
    background: rgba(12, 15, 18, 0.88);
    text-align: center;
    pointer-events: none;
  }
  .target-label span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.78rem;
  }
  .target-label small {
    display: block;
    margin-top: 0.15rem;
    font-size: 0.65rem;
    color: #c9f1b5;
  }
  @container (max-width: 640px) {
    .viewport {
      aspect-ratio: 4 / 5;
      min-height: 26rem;
    }
    .scene-footer {
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }
    .scene-actions {
      order: -1;
      text-align: center;
    }
    .inspection-buttons {
      justify-content: center;
    }
    .inspection-hint {
      display: none;
    }
  }
</style>
