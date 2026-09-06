<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { LoaderCircle, Pause, Play, Volume2, VolumeX } from '@lucide/svelte';

  export let playing = false;
  export let loading = false;
  export let muted = false;
  export let volume = 0.7;
  export let disabled = false;
  export let playbackError = '';
  export let playLabel = 'Play audio';
  export let pauseLabel = 'Pause audio';
  export let muteLabel = 'Mute audio';
  export let unmuteLabel = 'Unmute audio';
  export let volumeLabel = 'Audio volume';
  export let placement: 'none' | 'bottom-left' | 'top-left' = 'none';

  const dispatch = createEventDispatcher<{
    toggleplayback: void;
    togglemute: void;
    volumechange: { volume: number };
  }>();

  function handleVolumeInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    volume = Number(input.value);
    dispatch('volumechange', { volume });
  }

  $: audible = !muted && volume > 0;
  $: playbackLabel = playing ? pauseLabel : playLabel;
  $: muteToggleLabel = audible ? muteLabel : unmuteLabel;
</script>

<div class={`audio-controls ${placement}`}>
  <button
    aria-label={playbackLabel}
    class="audio-button"
    disabled={disabled}
    title={playbackError || playbackLabel}
    type="button"
    on:click={() => dispatch('toggleplayback')}
  >
    {#if loading}
      <span class="spin">
        <LoaderCircle size={17} />
      </span>
    {:else if playing}
      <Pause size={17} />
    {:else}
      <Play size={17} />
    {/if}
  </button>
  <button
    aria-label={muteToggleLabel}
    class="audio-button"
    title={muteToggleLabel}
    type="button"
    on:click={() => dispatch('togglemute')}
  >
    {#if audible}
      <Volume2 size={17} />
    {:else}
      <VolumeX size={17} />
    {/if}
  </button>
  <input
    aria-label={volumeLabel}
    class="volume-slider"
    max="1"
    min="0"
    step="0.01"
    type="range"
    value={volume}
    on:input={handleVolumeInput}
  />
</div>

<style>
  .audio-controls {
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

  .audio-controls.bottom-left,
  .audio-controls.top-left {
    position: absolute;
    z-index: 2;
  }

  .audio-controls.bottom-left {
    left: 1rem;
    bottom: 1rem;
  }

  .audio-controls.top-left {
    top: 1rem;
    left: 1rem;
  }

  .audio-button {
    display: grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    cursor: pointer;
    justify-content: center;
    align-content: center;
  }

  .audio-button:disabled {
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

  @media (max-width: 640px) {
    .audio-controls.bottom-left {
      right: 1rem;
    }

    .audio-controls.top-left {
      top: auto;
      left: 50%;
      bottom: 5.2rem;
      transform: translateX(-50%);
    }

    .volume-slider {
      width: min(7rem, 34vw);
    }
  }
</style>
