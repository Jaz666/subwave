import { requireDb } from './handle.js';

export function enqueueRegularGridScan(id: string): void {
  requireDb().prepare('INSERT OR IGNORE INTO regular_grid_scan_queue (track_id) VALUES (?)').run(id);
}

export function regularGridScanIds(): string[] {
  return (requireDb().prepare('SELECT track_id FROM regular_grid_scan_queue ORDER BY queued_at, track_id')
    .all() as Array<{ track_id: string }>).map(row => row.track_id);
}

export function removeRegularGridScan(id: string): void {
  requireDb().prepare('DELETE FROM regular_grid_scan_queue WHERE track_id = ?').run(id);
}
