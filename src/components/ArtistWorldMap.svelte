<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as d3 from 'd3';
  import { feature } from 'topojson-client';
  // World topojson: countries at 110m resolution
  import world from 'world-atlas/countries-110m.json';
  import type { Artist } from '../helpers/models';
  import { getArtists } from '../helpers/api';
  import { ArrowLeft } from '@lucide/svelte';
    import { goto } from '../helpers/router';

  let container: HTMLDivElement;
  let svg: SVGSVGElement;
  let mapG: SVGGElement | null = null;

  // Track zoom/pan state across redraws
  let currentTransform = d3.zoomIdentity as d3.ZoomTransform;
  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([1, 8])
    .on('zoom', (event) => {
      currentTransform = event.transform;
      if (mapG) d3.select(mapG).attr('transform', currentTransform.toString());
    });

  let loading = true;
  let error: string | null = null;

  let artists: Artist[] = [];
  let countries: any[] = [];
  let selectedCountry: any = null;
  let selectedArtists: Artist[] = [];

  // Map of country feature id -> artists in that country
  const countryArtistMap = new Map<any, Artist[]>();

  // Some territories (e.g., Isle of Man) are not represented as
  // separate polygons in the 110m world-atlas dataset, so a strict
  // point-in-polygon lookup can fail. Provide a minimal mapping of
  // such ISO-3166 alpha-2 territory codes to their parent country
  // name as used by the dataset so we can bucket artists correctly.
  const territoryToParentCountryName: Record<string, string> = {
    // UK territories / crown dependencies commonly encountered
    IM: 'United Kingdom', // Isle of Man
    GG: 'United Kingdom', // Guernsey
    JE: 'United Kingdom', // Jersey
    GI: 'United Kingdom', // Gibraltar
  };

  const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

  onMount(async () => {
    try {
      const data = await getArtists();
      artists = Array.isArray(data) ? (data as Artist[]) : [];

      // Convert TopoJSON to GeoJSON FeatureCollection
      // world.objects.countries exists in world-atlas datasets
      const geo = feature(world as any, (world as any).objects.countries) as any;
      countries = geo.features || [];

      indexArtistsByCountry();
      draw();

      // Observe container resize to keep map responsive
      if (container) resizeObserver.observe(container);
    } catch (e: any) {
      error = e?.message ?? String(e);
    } finally {
      loading = false;
    }
  });

  onDestroy(() => {
    resizeObserver.disconnect();
  });

  const resizeObserver = new ResizeObserver(() => {
    draw();
  });

  function indexArtistsByCountry() {
    countryArtistMap.clear();
    for (const c of countries) countryArtistMap.set(c.id, []);

    for (const a of artists) {
      if (
        a && typeof a.origin_lng === 'number' && typeof a.origin_lat === 'number'
      ) {
        const pt: [number, number] = [a.origin_lng, a.origin_lat];
        // Find the country that contains this point
        let match = countries.find((c) => d3.geoContains(c as any, pt));

        // Fallback: if no polygon contains the point (e.g., simplified
        // datasets dropping small islands), try mapping the artist's
        // origin_country via our territory->parent-country lookup.
        if (!match && a.origin_country) {
          const parent = territoryToParentCountryName[a.origin_country.toUpperCase?.() || ''];
          if (parent) {
            match = countries.find((c: any) => (c?.properties?.name || '').toLowerCase() === parent.toLowerCase());
          }
        }

        if (match) countryArtistMap.get(match.id)!.push(a);
      }
    }
  }

  function draw() {
    if (!svg || !countries?.length) return;
    const { width } = container?.getBoundingClientRect?.() ?? { width: 960 };
    const W = Math.max(320, width || 960);
    const H = Math.round(W * 0.55);

    const projection = d3.geoNaturalEarth1().fitSize([W, H], { type: 'Sphere' });
    const path = d3.geoPath(projection as any);

    const counts = countries.map((c) => countryArtistMap.get(c.id)?.length || 0);
    const max = d3.max(counts) ?? 0;
    const color = d3
      .scaleSequential(d3.interpolateReds)
      .domain([0, Math.max(1, max)]);

    const root = d3
      .select(svg)
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('width', '100%')
      .attr('height', 'auto')
      .attr('style', 'max-width: 100%; height: auto; display: block;');

    root.selectAll('*').remove();

    // Constrain zoom/pan to viewport and attach behavior (idempotent)
    (zoom as any)
      .extent([[0, 0], [W, H]])
      .translateExtent([[0, 0], [W, H]]);
    root.call(zoom as any);

    // Map group that will be zoomed/panned
    const g = root.append('g').attr('class', 'map');
    mapG = g.node() as SVGGElement;

    // Sphere (ocean background)
    g
      .append('path')
      .attr('d', path({ type: 'Sphere' })!)
      .attr('class', 'ocean')
      .attr('fill', '#0077be')
      .attr('stroke', '#0077be');

    // Countries layer
    g
      .append('g')
      .selectAll('path')
      .data(countries)
      .join('path')
      .attr('d', (d: any) => path(d)!)
      .attr('class', 'country')
      .attr('fill', (d: any) => color(countryArtistMap.get(d.id)?.length || 0))
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.5)
      .attr('cursor', 'pointer')
      .on('click', (_event: any, d: any) => {
        selectedCountry = d;
        selectedArtists = countryArtistMap.get(d.id) || [];
      })
      .append('title')
      .text((d: any) => {
        const name = countryName(d);
        const count = countryArtistMap.get(d.id)?.length || 0;
        return `${name}: ${count} artist${count === 1 ? '' : 's'}`;
      });

    // Re-apply the previous zoom transform after redraw (e.g., resize)
    if (mapG) {
      d3.select(mapG).attr('transform', currentTransform.toString());
      // Sync internal zoom state so subsequent wheel/drag starts from here
      root.call((zoom as any).transform, currentTransform);
    }

    // Simple color legend (right-bottom)
    if (max > 0) {
      const legendWidth = 160;
      const legendHeight = 8;
      const steps = 6;
      const g = root
        .append('g')
        .attr('transform', `translate(${W - legendWidth - 16}, ${H - 32})`);

      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const x = (legendWidth / steps) * i;
        g.append('rect')
          .attr('x', x)
          .attr('y', 0)
          .attr('width', legendWidth / steps)
          .attr('height', legendHeight)
          .attr('fill', color(t0 * max));
      }
      g
        .append('text')
        .attr('x', 0)
        .attr('y', legendHeight + 12)
        .attr('font-size', 10)
        .attr('fill', '#334155')
        .text('Fewer');
      g
        .append('text')
        .attr('x', legendWidth)
        .attr('y', legendHeight + 12)
        .attr('text-anchor', 'end')
        .attr('font-size', 10)
        .attr('fill', '#334155')
        .text('More');
    }
  }

  function countryName(d: any): string {
    const p = d?.properties ?? {};
    const name = p.name || p.admin || p.NAME || null;
    if (name) return name as string;
    // Fallback: infer from the most common artist code in that country
    const list = countryArtistMap.get(d?.id) || [];
    if (list.length) {
      const byCode = new Map<string, number>();
      for (const a of list) byCode.set(a.origin_country, (byCode.get(a.origin_country) || 0) + 1);
      let best = '', max = -1;
      for (const [k, v] of byCode) if (v > max) { max = v; best = k; }
      if (best) {
        try {
          return (regionNames.of(best) as string) || best;
        } catch {
          return best;
        }
      }
    }
    return `Country ${d?.id ?? ''}`.trim();
  }

  $: if (countries.length && container) {
    // Redraw if reactive inputs change
    draw();
  }

  // Derived: top countries by count (for quick summary)
  $: topCountries = countries
    .map((c) => ({ feature: c, count: countryArtistMap.get(c.id)?.length || 0 }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  function goBack() {
   goto({ page: 'vinyl' });
  }
 </script>

<!-- Header: centered title/hint, back button top-right -->
<div class="relative mb-4">
  <button
    type="button"
    class="btn-icon bg-grey dark:bg-white absolute right-0 top-0"
    title="Go"
    aria-label="Go back"
    on:click={goBack}
  >
    <ArrowLeft size={18} />
  </button>
  <div class="text-center">
    <h1 class="mb-1">Artists</h1>
    <div class="hint">A global visualisation of the Artists from my Vinyl Collection</div>
  </div>
</div>
  
  <div class="space-y-4">
  {#if loading}
    <p class="text-slate-600">Loading artist map…</p>
  {:else if error}
    <p class="text-red-600">{error}</p>
  {:else}
    <div class="w-full" bind:this={container}>
      <svg bind:this={svg} role="img" aria-label="World map of artists" />
    </div>

    {#if topCountries.length}
      <div class="text-sm text-slate-700 dark:text-slate-300">
        <span class="font-medium">Top countries:</span>
        {#each topCountries as t, i}
          <span class="ml-2">{i === 0 ? '' : '• '} {countryName(t.feature)} ({t.count})</span>
        {/each}
      </div>
    {/if}

    <div class="mt-4">
      {#if selectedCountry}
        <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-200">
          {countryName(selectedCountry)} — {selectedArtists.length} artist{selectedArtists.length === 1 ? '' : 's'}
        </h3>
        {#if selectedArtists.length === 0}
          <p class="text-slate-600 dark:text-slate-200">No artists from this country.</p>
        {:else}
          <ul class="mt-2 list-disc list-inside space-y-1">
            {#each selectedArtists as a}
              <li class="text-slate-800 dark:text-slate-200">{a.name}</li>
            {/each}
          </ul>
        {/if}
      {:else}
        <p class="text-slate-600 dark:text-slate-200">Click a country to see artists from there.</p>
      {/if}
    </div>
  {/if}
  </div>

<style>
  :global(svg path) {
    transition: fill 120ms ease-in-out;
  }
  :global(svg path.country:hover) {
    filter: brightness(0.9);
  }
  :global(svg path.country:active) {
    filter: brightness(0.8);
  }
  :global(svg path.country) {
    vector-effect: non-scaling-stroke;
  }
  :global(svg) {
    user-select: none;
  }
</style>
