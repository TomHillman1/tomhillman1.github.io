<script lang="ts">
  import Navbar from './lib/Navbar.svelte';
  import { route, type Route } from './helpers/router';

  import Vinyl from './components/VinylTable.svelte';
  import Professional from './components/Professional.svelte';
  import Contact from './components/Contact.svelte';
  import RecordView from './components/RecordView.svelte';
    import ArtistWorldMap from './components/ArtistWorldMap.svelte';

  $: r = $route as Route;
</script>

<Navbar />

<main class="max-w-6xl mx-auto px-4 py-8">
  {#if r.page === 'pro'} <Professional />
  {:else if r.page === 'vinyl'} <Vinyl />
  {:else if r.page === 'contact'} <Contact />
  {:else if r.page === 'record'}  <RecordView id={r.params?.id} />
  {:else if r.page === 'artists'}  <ArtistWorldMap/>
  {/if}
</main>