import {externalDiscoveriesInDatabase} from './external-discoveries.js';
// Read-only CPU work in a separate process. No provider calls and no writes to
// station state: the controller owns validation and atomic index publication.
import Database from 'better-sqlite3';
import { buildConnectionLibraryPatch, connectionRevision } from './library-connections.js';
import { researchConnectionsOverviewInDatabase } from './connections-overview.js';
import type { ConnectionEdgeType } from './research-repository.js';

process.on('disconnect', () => process.exit(0));
process.on('message', (message: { id: number; path: string; kind: 'overview' | 'matches' | 'discoveries'; edges?: ConnectionEdgeType[] }) => {
  let db: Database.Database | null = null;
  try {
    db = new Database(message.path, { readonly: true, fileMustExist: true });
    db.pragma('cache_size = -8192');
    // All inputs and the revision come from the same WAL snapshot.
    db.exec('BEGIN');
    const result = message.kind === 'matches' ? buildConnectionLibraryPatch(db) : {
      revision: connectionRevision(db, 'overview'),
      json: JSON.stringify(message.kind==='discoveries'?externalDiscoveriesInDatabase(db):{ active: true, ...researchConnectionsOverviewInDatabase(db, message.edges) }),
    };
    db.exec('COMMIT');
    process.send?.({ id: message.id, result });
  } catch (error) {
    process.send?.({ id: message.id, error: error instanceof Error ? error.message : 'Connection calculation failed' });
  } finally { db?.close(); }
});
