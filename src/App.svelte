<script lang="ts">
  import Navbar from './lib/Navbar.svelte';
  import { view, type View } from './lib/view';
  import Professional from './components/Professional.svelte';
  import Contact from './components/Contact.svelte';
  import Vinyl from './components/Vinyl.svelte';
  import { onMount } from 'svelte';

  const valid = new Set<View>(['vinyl', 'pro', 'contact']);
  const map: Record<View, any> = { vinyl: Vinyl, pro: Professional, contact: Contact };
  $: Current = map[$view];
  onMount(() => {
    // set initial tab from URL
    const applyFromHash = () => {
      const h = (location.hash || '#vinyl').slice(1) as View;
      if (valid.has(h)) view.set(h);
    };
    applyFromHash();

    // update tab when the hash changes (back/forward supported)
    window.addEventListener('hashchange', applyFromHash);

    // keep the URL in sync when the store changes
    const unsub = view.subscribe((v) => {
      if (location.hash.slice(1) !== v) location.hash = v;
    });

    return () => { window.removeEventListener('hashchange', applyFromHash); unsub(); };
  });
</script>

<Navbar />

<main class="mx-auto px-4 py-8 space-y-8">
  <svelte:component this={Current} />
</main>