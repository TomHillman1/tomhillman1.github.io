import { createClient } from '@supabase/supabase-js';


const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BUCKET = import.meta.env.VITE_SUPABASE_BUCKET || 'media';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

export const getSignedCover = async(path?: string | null) => {
    if (!path) return null;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    return error ? null : data.signedUrl;
}

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