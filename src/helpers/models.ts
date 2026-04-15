export type Vinyl =
{
    id: string,                // uuid
    artist: string,            // artist name
    year: string,              // year of release
    title: string,             // album title
    cover_url: string,         // url to cover image
    description: string,       // album description
    record_type: string,       // LP, EP, Single etc
    genre: string,             // genre
    speed: string              // 33, 45, 78 etc
    artist_id: string              // 33, 45, 78 etc
}

export type Track =
{
    id: string,                // uuid
    record_id: string,         // uuid of parent record 
    track_no: number,          // track number on the record
    title: string,             // track title
    description: string,       // track description
    audio_url: string,         // url to audio file
    side_no: string,           // side A, B, 1, 2 etc
}

export type Artist = 
{
    id: string,                // uuid
    name: string,              // artist name
    dob: string,                 // date of birth
    origin_place: string,      // city or town
    origin_country: string,    // ISO-3166 alpha-2 country code (e.g. "GB")
    origin_lat: number,        // latitude (float)
    origin_lng: number,        // longitude (float)
    description: string,       // short bio
};
  
export type Experience =
{
    id: string,                // uuid
    name: string,              // experience name
    description: string,       // experience description
    mediaurl: string,        // url to media (image/video)
    isImportant: boolean       // is important experience
}

export type PS1GameDb =
{
    id: string,                // id (serial number)
    name: string,              // game title
    release: string | null,    // date of release
    year: number | null,       // year of release
    genre: string | null,      // genre (comma separated)
    developer: string | null,  // developer
    publisher: string | null,  // publisher
    created_at: string         // timestamp of doc creation
}

export type PS1Game =
{
    id: string,                // id (serial number)
    name: string,              // game title
    release: string | null,    // date of release
    year: number | null,       // year of release
    genre: string[],           // genre list
    developer: string | null,  // developer
    publisher: string | null,  // publisher
    createdAt: string,         // timestamp of doc creation
    coverFront: string,        // storage path for front cover
    coverBack: string,         // storage path for back cover
    coverSide: string          // storage path for side/spine cover
}

export type PS1Row = PS1Game & {
    frontSignedUrl?: string | null;
    backSignedUrl?: string | null;
    sideSignedUrl?: string | null;
};
