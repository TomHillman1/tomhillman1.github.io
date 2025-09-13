import { writable } from 'svelte/store';

export type Page = 'vinyl' | 'pro' | 'contact' | 'record' | 'artists';
export type Route = { page: Page; params?: Record<string, string> };

function parseHash(): Route {
  const h = location.hash.replace(/^#\/?/, ''); // drop leading #/
  const [page, ...rest] = h.split('/');
  if (page === 'record' && rest[0]) return { page: 'record', params: { id: decodeURIComponent(rest[0]) } };
  if (page === 'pro') return { page: 'pro' };
  if (page === 'contact') return { page: 'contact' };
  if (page === 'artists') return { page: 'artists' };
  return { page: 'vinyl' }; // default
}

export const route = writable<Route>(parseHash());

export function goto(r: Route) {
  const hash = r.page === 'record'
    ? `#/record/${encodeURIComponent(r.params!.id)}`
    : `${r.page}`;
  if (location.hash !== hash) location.hash = hash;
  route.set(r);
}

// keep store in sync with back/forward or manual hash edits
window.addEventListener('hashchange', () => route.set(parseHash()));
