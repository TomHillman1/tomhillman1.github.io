<script lang="ts">
    export let title: string = 'Experience Title';
    let imgSrc: string = 'https://picsum.photos/800/343';
</script>
<a
  href="#"
  class="card preset-filled-surface-100-900 border-[1px] border-surface-200-800 card-hover divide-surface-200-800 flex h-full flex-col divide-y overflow-hidden">
    <header>
    <img src={imgSrc} class="aspect-[21/9] w-full grayscale hue-rotate-90" alt="banner" />
  </header> 
  <article class="space-y-4 p-4 flex-1 text-surface-600 dark:text-surface-200">
    <div>
      <h2 class="h6">{title}</h2>
    </div>
    <p>
      Lorem ipsum dolor sit amet consectetur adipisicing elit. Numquam aspernatur provident eveniet eligendi cumque consequatur tempore sint
      nisi sapiente. Iste beatae laboriosam iure molestias cum expedita architecto itaque quae rem.
    </p>
  </article>

  <footer class="flex items-center justify-end p-4 pt-0 text-surface-600 dark:text-surface-200">
    <p class="opacity-60">Worked on from {new Date().toLocaleDateString()}</p>
  </footer>
</a>
