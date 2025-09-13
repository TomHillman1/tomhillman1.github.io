<script lang="ts">
  import { Modal } from '@skeletonlabs/skeleton-svelte';
  import type { Artist } from '../helpers/models';
  import { onMount } from 'svelte';
  import { getArtist } from '../helpers/api';

 
  export let artist_id: string;
  export let openState: boolean = false;
  let artist: Artist | null = null;

  onMount(async() => {
    artist = await getArtist(artist_id);
  });

  function modalClose() {
    openState = false;
  }

</script>
<Modal
  open={openState}
  onOpenChange={(e) => (openState = e.open)}
  triggerBase="btn preset-tonal"
  contentBase="card bg-surface-100-900 p-4 space-y-4 shadow-xl max-w-screen-sm"
  backdropClasses="backdrop-blur-sm"
>
  {#snippet trigger()}Open Modal{/snippet}
  {#snippet content()}
    {#key artist}
      {#if !artist}
        <p>Loading...</p>
      {:else}
        <header class="flex justify-between">
          <h2 class="h2">{artist.name}</h2>
        </header>
        <hint class="opacity-80">
          {artist.dob !== "0001-01-01" ? `${artist.dob} • ` : ""}
          {artist.origin_place}
        </hint>
        <article>
          <p class="opacity-60">
            {artist.description}
          </p>
        </article>
      {/if}
    {/key}
  {/snippet}
</Modal>