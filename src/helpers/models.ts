export type Vinyl =
{
    id: string,
    artist: string,
    year: string,
    title: string,
    cover_url: string,
    description: string,
    record_type: string,
    genre: string,
    speed: string
}

export type Track =
{
    id: string,
    record_id: string,
    track_no: number,
    title: string,
    description: string,
    audio_url: string,
    side_no: string,
}