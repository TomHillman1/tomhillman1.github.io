import { writable } from 'svelte/store';
export type View = 'vinyl' | 'pro' | 'contact';
export const view = writable<View>('vinyl');