import { writable } from 'svelte/store';
export type View = 'vinyl' | 'ps1' | 'pro' | 'contact';
export const view = writable<View>('pro');
