<script lang="ts">
  import { onMount } from 'svelte';
  import type { Track, Vinyl } from '../helpers/models';
  import { getRecord, getTracks, getSignedURL } from '../helpers/api';
  import { mapNumbertoChar } from '../helpers/mappers';

  export let id: string | undefined;

  let record: Vinyl | null = null;
  type TrackRow = Track & { audioSignedUrl?: string | null };
  let tracks: TrackRow[] = [];
  let coverSignedUrl: string | null = null;
  let loading = true, errorMsg = '';

  async function load() {
    if (!id) { errorMsg = 'No record id in URL.'; loading = false; return; }
    loading = true; errorMsg = '';

    record = await getRecord(id);
    if (!record) { errorMsg = 'Record not found.'; loading = false; return; }

    coverSignedUrl = record.cover_url ? await getSignedURL(record.cover_url) : null;
    
    const tracksdata = await getTracks(id);

    tracks = await Promise.all(
    (tracksdata ?? []).map(async r => 
      ({
        ...r, audioSignedUrl: r.audio_url ? await getSignedURL(r.audio_url) : null
      }))
    );
    // order by side then track
    tracks.sort((a, b) => Number(a.side_no) - Number(b.side_no) || a.track_no - b.track_no);
    loading = false;
  }

  onMount(load);
  // reload when the id prop changes (e.g., navigating between records without leaving the page)
  $: id, id && load();

</script>

<section>
  <a class="text-sm text-primary-600 hover:underline" href="#/vinyl">← All records</a>

  {#if loading}
    <p class="mt-4">Loading…</p>
  {:else if errorMsg}
    <p class="mt-4 text-red-600">{errorMsg}</p>
  {:else if record}
    <div class="mt-4 flex items-start gap-6 pb-6">
        {#if coverSignedUrl}
            <img src={coverSignedUrl} alt={`Cover of ${record.title}`} class="w-40 h-40 object-cover rounded-lg" />
        {/if}
        <div>
            <h1 class="text-3xl font-semibold">{record.title}</h1>
            <p class="dark:text-surface-200">{record.artist} • {record.year} • {record.genre}</p>
            <p class="mt-2 dark:text-surface-200">{record.description}</p>
        </div>
    </div>
    <div class="tabler-wrap max-w-6xl">
      <div class="max-h-[60rem] overflow-y-auto overflow-x-auto rounded-lg shadow-sm pb-2">
        <table class="table caption-bottom min-w-full">
          <thead
            class="sticky top-0 z-10
                  bg-surface-100/80 dark:bg-surface-800/80
                  backdrop-blur supports-[backdrop-filter]:bg-surface-100/60 dark:supports-[backdrop-filter]:bg-surface-800/60">
            <tr>
              <th>Track</th>
              <th>Description</th>
              <th>Side</th>
              <th>#</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each tracks as t}
              <tr>
                <td class="text-left whitespace-nowrap min-w-max pr-4">{t.title}</td>
                <td class="text-left align-top">{t.description}</td>
                <td>{mapNumbertoChar(t.side_no)}</td>
                <td>{t.track_no}</td>
                <td class="text-right">
                  <audio controls>
                    <source src={t.audioSignedUrl} type="audio/mp4" />
                    Your browser does not support the audio element.
                  </audio>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="pl-2 text-left dark:text-surface-200">
        {"Record ID : " + record.id +", Speed : " + record.speed + "RPM"}
      </p>
      <div class="h-8"> </div>
    </div>
  {/if}
</section>


<style>
  :root { --pad: 12px; }

  .grid { overflow-x: auto; background: white; border: 1px solid #eee; border-radius: 10px; color: #111; }

  h1 { margin: 0 0 1rem; }
  @media (max-width: 640px) {
    th:nth-child(4), td:nth-child(4) { display:none; }
  }
</style>