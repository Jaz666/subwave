# Sleeve Notes and Navidrome canonical IDs

Sleeve Notes is a separate SQLite sidecar, so the library-db adoption in
Sub/Wave PR #1255 cannot move its local IDs automatically. It must receive the
same already-validated `trackMap` while `applyPendingRotation()` is applying
controller-owned state.

When PR #1255 is present, add this call in `music/id-rotation.ts`, after the
map has been read and before `id-rotation.json` is removed:

```ts
import * as sleeveNotes from '../sleeve-notes/repository.js';

const sleeve = sleeveNotes.remapLocalTrackIds(trackMap);
```

The function remaps every Sleeve Notes field containing a Navidrome track ID:

- `entities.local_id` for canonical local track entities;
- `provider_local_matches.local_track_id`; and
- `uses.track_id` in the immutable airing ledger.

It consumes PR #1255's confirmed old-to-new map; it does not call Navidrome,
reimplement `canonicalId()`, or fabricate mappings. That keeps the two
migrations idempotent and means deleted or uncertain tracks remain unlinked.
