import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BUCKET = import.meta.env.VITE_SUPABASE_BUCKET || 'media';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
})

const ensureSession = async (timeoutMs = 2000) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) return session

  return await new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => { if (!settled) { settled = true; resolve(null) } }, timeoutMs)

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (settled) return
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        settled = true
        clearTimeout(timer)
        sub.subscription.unsubscribe()
        resolve(s ?? null)
      }
    })
  })
}

export const getSignedURL = async (path?: string | null) => {
  if (!path) return null


  const session = await ensureSession()


  console.log('session user:', session?.user?.id ?? null)
  console.log('using bearer starts with:', session?.access_token?.slice(0, 16) ?? 'ANON')

  if (!session) {
    return null
  }
  const key = path.replace(/^\/+/, '').replace(/\/{2,}/g, '/').trim()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(key, 3600)
  if (error) {
    console.error('createSignedUrl error:', error)
    return null
  }
  return data.signedUrl
}


// API GETS
export const getRecords = async () => {
    const { data, error } = await supabase
        .from('records')
        .select('*')
        .order('artist', { ascending: true })
        .order('year', { ascending: false });
    if (error) {
        console.error('Error fetching records:', error);
        return [];
    }
    return data;
};

export const getRecord = async (id: string) => {
    const { data, error } = await supabase
        .from('records')
        .select('*')
        .eq('id', id)
        .single();
    if (error) {
        console.error('Error fetching record:', error);
        return [];
    }
    return data;
};

export const getTracks = async (id: string) => {
    const { data, error } = await supabase
        .from('tracks')
        .select('*')
        .eq('record_id', id);
    if (error) {
        console.error('Error fetching tracks:', error);
        return [];
    }
    return data;
};

export const getTrack = async () => {
    const { data, error } = await supabase
        .from('records')
        .select('*')
        .order('artist', { ascending: true })
        .order('year', { ascending: false });
    if (error) {
        console.error('Error fetching records:', error);
        return [];
    }
    return data;
};

export const getArtists = async () => {
    const { data, error } = await supabase
        .from('artists')
        .select('*');
    if (error) {
        console.error('Error fetching artists:', error);
        return [];
    }
    return data;
};

export const getArtist = async (id: string) => {
    const { data, error } = await supabase
        .from('artists')
        .select('*')
        .eq('id', id)
        .single();
    if (error) {
        console.error('Error fetching artist:', error);
        return [];
    }
    return data;
};