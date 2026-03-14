import type { PS1Game, PS1GameDb } from './models';

export const mapNumbertoChar = (num: string) => {
    let numInt = parseInt(num);
    return String.fromCharCode(96 + numInt).toUpperCase();
}

const parseGenres = (genre?: string | null) => {
    if (!genre) return [];
    return genre.split(',').map(s => s.trim()).filter(Boolean);
};

export const mapPS1Game = (g: PS1GameDb): PS1Game => ({
    id: g.id,
    name: g.name,
    release: g.release,
    year: g.year,
    genre: parseGenres(g.genre),
    developer: g.developer,
    publisher: g.publisher,
    createdAt: g.created_at,
    coverFront: `gamecovers/front/${g.id}.jpg`,
    coverBack: `gamecovers/back/${g.id}.jpg`
});
