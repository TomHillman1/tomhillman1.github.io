<script lang="ts">
  import AudioControl from './AudioControl.svelte';
  import ps1LoadStillUrl from '../assets/ps1loadstill.jpg?url';
  import ps1LoadVideoUrl from '../assets/ps1loadscreen.mp4?url';

  export let active = true;
  export let progress = 0;
  export let loaded = 0;
  export let total = 0;
  export let statusText: string | null = null;
  export let countText: string | null = null;

  let overlayVisible = active;
  let fadingOut = false;
  let videoEnded = false;
  let introMuted = true;
  let introVolume = 0.7;
  let introPlaying = false;
  let introLoading = false;
  let introPlaybackError = '';
  let introAutoplayPending = true;
  let skipRequested = false;
  let videoEl: HTMLVideoElement | null = null;
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;
  let loadPercent = 0;
  let assetsReady = !active;
  let canSkipIntro = assetsReady && !videoEnded;

  function pauseIntro() {
    videoEl?.pause();
  }

  async function playIntro() {
    if (!videoEl) return;

    if (videoEnded) {
      videoEnded = false;
      videoEl.currentTime = 0;
    }

    introLoading = true;
    introPlaybackError = '';
    videoEl.muted = introMuted || introVolume <= 0;
    videoEl.volume = introVolume;

    try {
      await videoEl.play();
    } catch (err) {
      introPlaying = false;
      introPlaybackError = 'Playback blocked. Press play to start intro.';
      console.warn('Failed to play intro video.', err);
    } finally {
      introLoading = false;
    }
  }

  async function toggleIntroPlayback() {
    if (introPlaying) {
      pauseIntro();
      return;
    }

    await playIntro();
  }

  async function toggleIntroMute() {
    introMuted = !introMuted;

    if (!introMuted && videoEl?.paused && !videoEnded) {
      await playIntro();
    }
  }

  async function startIntroPlayback() {
    if (!videoEl || videoEnded) return;

    videoEl.muted = introMuted || introVolume <= 0;
    videoEl.volume = introVolume;

    try {
      await videoEl.play();
    } catch {
      // If autoplay is blocked, the poster stays visible and the scene still loads normally.
    }
  }

  function handleVideoEnded() {
    videoEnded = true;
    introPlaying = false;
    introLoading = false;
  }

  function handleIntroVolumeChange(event: CustomEvent<{ volume: number }>) {
    introVolume = event.detail.volume;
    if (introVolume > 0 && introMuted) {
      introMuted = false;
      if (videoEl?.paused && !videoEnded) {
        void playIntro();
      }
    }
  }

  function requestSkip() {
    if (!assetsReady) return;
    skipRequested = true;
  }

  function resetOverlayCycle() {
    skipRequested = false;
    videoEnded = false;
    introAutoplayPending = true;
    introPlaybackError = '';
    overlayVisible = true;
    fadingOut = false;
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    if (videoEl) {
      videoEl.pause();
      videoEl.currentTime = 0;
    }
  }

  $: if (active && (!overlayVisible || fadingOut)) {
    resetOverlayCycle();
  }

  $: assetsReady = !active;
  $: loadPercent = Math.max(0, Math.min(100, Math.round(progress * 100)));
  $: canSkipIntro = assetsReady && !videoEnded;
  $: if (videoEl) {
    videoEl.volume = introVolume;
    videoEl.muted = introMuted || introVolume <= 0;
  }

  $: if (!active && overlayVisible && !fadingOut && (videoEnded || skipRequested)) {
    fadingOut = true;
    hideTimeout = setTimeout(() => {
      overlayVisible = false;
      fadingOut = false;
      videoEl?.pause();
      hideTimeout = null;
    }, 420);
  }

  $: if (overlayVisible && videoEl && introAutoplayPending && !videoEnded) {
    introAutoplayPending = false;
    void startIntroPlayback();
  }
</script>

{#if overlayVisible}
  <div class:fade-out={fadingOut} class="loading-overlay" aria-hidden={!overlayVisible}>
    <div class="boot-stage">
      <video
        bind:this={videoEl}
        class:hidden={videoEnded}
        class="boot-video"
        poster={ps1LoadStillUrl}
        playsinline
        preload="auto"
        muted={introMuted || introVolume <= 0}
        on:canplay={() => introLoading = false}
        on:ended={handleVideoEnded}
        on:error={() => {
          introPlaying = false;
          introLoading = false;
          introPlaybackError = 'Could not play intro audio.';
        }}
        on:pause={() => introPlaying = false}
        on:play={() => introPlaying = true}
        on:playing={() => {
          introPlaying = true;
          introLoading = false;
        }}
        on:waiting={() => introLoading = true}
      >
        <source src={ps1LoadVideoUrl} type="video/mp4" />
      </video>

      <div class="still-shell" class:visible={videoEnded}>
        <img alt="PlayStation startup still" class="still-image" src={ps1LoadStillUrl} />
      </div>

      <AudioControl
        disabled={true}
        loading={introLoading}
        muted={introMuted || introVolume <= 0}
        pauseLabel="Intro playback locked"
        playbackError={introPlaybackError}
        placement="bottom-left"
        playing={introPlaying}
        playLabel="Intro playback locked"
        muteLabel="Mute intro audio"
        unmuteLabel="Unmute intro audio"
        volume={introVolume}
        volumeLabel="Intro volume"
        on:toggleplayback={toggleIntroPlayback}
        on:togglemute={toggleIntroMute}
        on:volumechange={handleIntroVolumeChange}
      />

      {#if canSkipIntro}
        <button class="skip-toggle" type="button" on:click={requestSkip}>
          Skip intro
        </button>
      {/if}
    </div>

    <div class="loading-hud">
      <div class="loading-meta">
        <span class="loading-label">
          {#if statusText}
            {statusText}
          {:else if active}
            Reading memory card...
          {:else if videoEnded}
            Boot complete...
          {:else}
            System ready. Skip intro or wait...
          {/if}
        </span>
        <span class="loading-value">{loadPercent}%</span>
      </div>
      <div class="loading-bar-frame" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={loadPercent}>
        <div class="loading-bar-track">
          <div class="loading-bar-fill" style={`width: ${loadPercent}%`}></div>
        </div>
      </div>
      <div class="loading-count">
        {#if countText}
          {countText}
        {:else}
          {loaded}/{Math.max(total, 1)} assets
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .loading-overlay {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: grid;
    grid-template-rows: 1fr auto;
    background: #000;
    color: #f6f6f6;
    opacity: 1;
    transition: opacity 0.42s ease;
  }

  .loading-overlay.fade-out {
    opacity: 0;
    pointer-events: none;
  }

  .boot-stage {
    position: relative;
    min-height: 0;
    overflow: hidden;
    background: #000;
  }

  .boot-video,
  .still-shell {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .boot-video {
    object-fit: cover;
    background: #000;
  }

  .boot-video.hidden {
    display: none;
  }

  .still-shell {
    display: grid;
    place-items: center;
    opacity: 0;
    transition: opacity 0.28s ease;
    background: #000;
  }

  .still-shell.visible {
    opacity: 1;
  }

  .still-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .skip-toggle {
    position: absolute;
    top: 1rem;
    right: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.24);
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    border-radius: 999px;
    padding: 0.6rem 0.95rem;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
    backdrop-filter: blur(12px);
  }

  .loading-hud {
    padding: 1rem 1rem 1.2rem;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.95), rgba(0, 0, 0, 0.72));
  }

  .loading-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.5rem;
    font-size: 0.78rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .loading-label {
    color: rgba(255, 255, 255, 0.72);
  }

  .loading-value {
    font-variant-numeric: tabular-nums;
  }

  .loading-bar-frame {
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 999px;
    padding: 0.22rem;
    background: rgba(255, 255, 255, 0.06);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  }

  .loading-bar-track {
    height: 0.7rem;
    border-radius: 999px;
    overflow: hidden;
    background:
      linear-gradient(to right, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
      #0c0c0c;
  }

  .loading-bar-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #e4b622 0%, #46d6cf 35%, #4a8cf5 70%, #ef3124 100%);
    box-shadow: 0 0 14px rgba(74, 140, 245, 0.45);
    transition: width 0.16s ease;
  }

  .loading-count {
    margin-top: 0.55rem;
    color: rgba(255, 255, 255, 0.64);
    font-size: 0.74rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 640px) {
    .skip-toggle {
      top: auto;
      right: 50%;
      bottom: 2rem;
      transform: translateX(50%);
    }

    .loading-meta {
      font-size: 0.68rem;
      letter-spacing: 0.1em;
    }
  }
</style>
