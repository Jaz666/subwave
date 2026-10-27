import express from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import * as subsonic from '../../music/subsonic.js';

export const router = express.Router();

router.get('/library/sub-flow/albums', requireAdmin, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.status(400).json({ error: 'Search text is required' });
  try {
    const albums = await subsonic.searchAlbums(q);
    res.json({ albums: albums.map((album: any) => ({
      id: album.id, name: album.name, artist: album.artist ?? null,
      year: album.year ?? null, coverArt: album.coverArt ?? null,
    })) });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Album search failed' });
  }
});

router.get('/library/sub-flow/albums/:id/tracks', requireAdmin, async (req, res) => {
  try {
    const songs = await subsonic.getAlbum(req.params.id);
    res.json({ tracks: songs.map((song: any) => ({
      id: song.id, title: song.title, artist: song.artist ?? null,
      album: song.album ?? null, duration: song.duration ?? null,
      discNumber: song.discNumber ?? null, track: song.track ?? null,
    })) });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Album tracks could not be loaded' });
  }
});
