<script lang="ts">
  import ps1LoadStillUrl from '../assets/ps1loadstill.jpg?url';
  import ps1LoadVideoUrl from '../assets/ps1loadscreen.mp4?url';

  export let active = true;
  export let progress = 0;
  export let loaded = 0;
  export let total = 0;

  let overlayVisible = active;
  let fadingOut = false;
  let videoEnded = false;
  let audioEnabled = false;
  let videoEl: HTMLVideoElement | null = null;
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  const loadPercent = () => Math.max(0, Math.min(100, Math.round(progress * 100)));

  async function enableAudio() {
    if (!videoEl) return;

    audioEnabled = true;
    videoEl.muted = false;

    try {
      await videoEl.play();
    } catch {
      audioEnabled = false;
    }
  }

  async function startIntroPlayback() {
    if (!videoEl || !active) return;

    videoEnded = false;
    videoEl.currentTime = 0;
    videoEl.muted = !audioEnabled;

    try {
      await videoEl.play();
    } catch {
      // If autoplay is blocked, the poster stays visible and the scene still loads normally.
    }
  }

  function handleVideoEnded() {
    videoEnded = true;
  }

  $: if (active) {
    overlayVisible = true;
    fadingOut = false;
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  }

  $: if (!active && overlayVisible && !fadingOut) {
    fadingOut = true;
    hideTimeout = setTimeout(() => {
      overlayVisible = false;
      fadingOut = false;
      videoEl?.pause();
      hideTimeout = null;
    }, 420);
  }

  $: if (active && overlayVisible && videoEl) {
    void startIntroPlayback();
  }
</script>

{#if overlayVisible}
  <div class:fade-out={fadingOut} class="loading-overlay" aria-hidden={!active}>
    <div class="boot-stage">
      <video
        bind:this={videoEl}
        class:hidden={videoEnded}
        class="boot-video"
        poster={ps1LoadStillUrl}
        playsinline
        preload="auto"
        muted={!audioEnabled}
        on:ended={handleVideoEnded}
      >
        <source src={ps1LoadVideoUrl} type="video/mp4" />
      </video>

      <div class="still-shell" class:visible={videoEnded}>
        <img alt="PlayStation startup still" class="still-image" src={ps1LoadStillUrl} />
      </div>

      {#if active && !audioEnabled}
        <button class="audio-toggle" type="button" on:click={enableAudio}>
          Enable audio
        </button>
      {/if}
    </div>

    <div class="loading-hud">
      <div class="loading-meta">
        <span class="loading-label">Reading memory card...</span>
        <span class="loading-value">{loadPercent()}%</span>
      </div>
      <div class="loading-bar-frame" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={loadPercent()}>
        <div class="loading-bar-track">
          <div class="loading-bar-fill" style={`width: ${loadPercent()}%`}></div>
        </div>
      </div>
      <div class="loading-count">{loaded}/{Math.max(total, 1)} assets</div>
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

  .audio-toggle {
    position: absolute;
    top: 1rem;
    right: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.24);
    background: rgba(0, 0, 0, 0.66);
    color: #f8f8f8;
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
    .audio-toggle {
      top: auto;
      right: 50%;
      bottom: 5.2rem;
      transform: translateX(50%);
    }

    .loading-meta {
      font-size: 0.68rem;
      letter-spacing: 0.1em;
    }
  }
</style>
