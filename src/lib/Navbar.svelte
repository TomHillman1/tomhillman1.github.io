<script lang="ts">
  import { view, type View } from '../lib/view';
  const items: { id: View; label: string }[] = [
    { id: 'pro', label: 'Professional' },
    { id: 'contact', label: 'Contact' },
    { id: 'vinyl', label: 'Vinyl' }
  ];
  let open = false;
  const go = (id: View) => { view.set(id); open = false; };
</script>

<nav class="navbar sticky top-0 z-50 border-b border-surface-300/60
            bg-surface-50/80 backdrop-blur supports-[backdrop-filter]:bg-surface-50/60">
    <div class="max-w-6xl mx-auto px-4">
      <div class="h-14 flex items-center justify-between">
        <!-- Brand -->
        <a href="/"
          class="font-semibold text-lg tracking-tight text-surface-900 hover:text-primary-600">
          Tom Hillman
        </a>

        <!-- Desktop links -->
        <div class="hidden md:flex items-center gap-6">
          {#each items as it}
            <a
              href={"#" + it.id}
              on:click={() => go(it.id)}
              class="relative px-2 py-1 text-surface-800 hover:text-primary-600"
              aria-current={$view === it.id ? 'page' : undefined}
            >
              {it.label}
              {#if $view === it.id}
                <span class="absolute -bottom-2 left-2 right-2 h-0.5 bg-primary-600 rounded-full"></span>
              {/if}
            </a>
          {/each}
          <!-- Example CTA -->
        <!-- Mobile toggle -->
        <button class="md:hidden p-2 rounded-lg hover:bg-surface-200"
                aria-label="Menu" aria-expanded={open}
                on:click={() => (open = !open)}>
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
      </div>
  </div>

  <!-- Mobile menu -->
  {#if open}
    <div class="md:hidden border-t border-surface-300/60 bg-surface-100">
      <div class="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-2 text-surface-900">
        {#each items as it}
          <a href={"#" + it.id} on:click={() => go(it.id)}
             class="py-2 hover:text-primary-600">{it.label}</a>
        {/each}
      </div>
    </div>
  {/if}
</nav>

<style>
  nav{
    color: rgba(255, 255, 255, 0.87);
    background-color: #242424;
  }
  a{
    color: rgba(255, 255, 255, 0.87);
    background-color: #242424;
  }
  
  @media (prefers-color-scheme: light) {
    nav{
      color: #213547;
      background-color: #ffffff;
    }
    a{
      color: #213547;
      background-color: #ffffff;
    }
  }
</style>
