<script lang="ts">
    import ExperienceCard from './ExperienceCard.svelte';
    import { onMount } from 'svelte';
    import type { Experience } from '../helpers/models';
    import { getExperiences, getSignedURL } from '../helpers/api';
    
    type ExperienceData = Experience & { coverSignedUrl?: string | null };
    let experiences : ExperienceData[] = [];
    let loading = true;
    
    onMount(async () => {
      const data = await getExperiences();
      experiences = await Promise.all(
        (data ?? []).map(async r => ({ ...r, coverSignedUrl: await getSignedURL(`${r.mediaurl}cover.jpg`) }))
      );
      loading = false;
    });

</script>

<h1>Tom Hillman</h1>
<h2>A software engineer based in south-east London</h2>

{#if loading}
  <div>Loading...</div>
{:else}
  <div class="grid grid-cols-3 items-stretch gap-4 pt-5">
    {#each experiences as experience}
    {#if experience.isImportant}
      <div class="col-span-2 h-full">
        <ExperienceCard title={experience.name} paragraph = {experience.description} />
      </div>
    {:else}
      <div class="h-full">
        <ExperienceCard title={experience.name} paragraph = {experience.description} />
      </div>
    {/if}
    {/each}
  </div>
{/if}
