import { writable } from 'svelte/store';

export type Page = 'vinyl' | 'ps1' | 'pro' | 'contact' | 'record' | 'artists';
export type Route = { page: Page; params?: Record<string, string> };

function parseHash(): Route | null {
  const h = location.hash.replace(/^#\/?/, ''); // drop leading #/
  if (!h) return null;
  const [page, ...rest] = h.split('/');
  if (page === 'record' && rest[0]) return { page: 'record', params: { id: decodeURIComponent(rest[0]) } };
  if (page === 'pro') return { page: 'pro' };
  if (page === 'contact') return { page: 'contact' };
  if (page === 'artists') return { page: 'artists' };
  if (page === 'vinyl') return { page: 'vinyl' };
  if (page === 'ps1') return { page: 'ps1' };
  return null;
}

function parsePath(): Route {
  const path = location.pathname.replace(/\/+$/, '');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'record' && parts[1]) return { page: 'record', params: { id: decodeURIComponent(parts[1]) } };
  if (parts[0] === 'pro') return { page: 'pro' };
  if (parts[0] === 'contact') return { page: 'contact' };
  if (parts[0] === 'artists') return { page: 'artists' };
  if (parts[0] === 'vinyl') return { page: 'vinyl' };
  if (parts[0] === 'ps1') return { page: 'ps1' };
  return { page: 'pro' }; // default
}

function parseLocation(): Route {
  return parseHash() ?? parsePath();
}

export const route = writable<Route>(parseLocation());

export function goto(r: Route) {
  const path = r.page === 'record'
    ? `/record/${encodeURIComponent(r.params!.id)}`
    : (r.page === 'pro' ? '/' : `/${r.page}`);
  if (location.pathname !== path) history.pushState({}, '', path);
  route.set(r);
}

// keep store in sync with back/forward or manual hash edits
window.addEventListener('popstate', () => route.set(parseLocation()));
window.addEventListener('hashchange', () => route.set(parseLocation()));
