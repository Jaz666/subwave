// Queue at most 25 historical roots with sample links to known library artists.
// Expanding saved results itself makes no API calls.
const { open } = await import('./src/sleeve-notes/db.ts');
const { registerGeniusTraversal, geniusTraversalArtistAllowed } = await import('./src/sleeve-notes/genius-traversal.ts');
globalThis.fetch = async () => { throw new Error('This command must not make API calls'); };
const db = open();
try {
  const rows = db.prepare(`SELECT source.entity_id AS id,source.content
    FROM sleeve_source_documents source
    WHERE source.provider='genius' AND source.entity_type='recording'
      AND json_valid(source.content)
      AND NOT EXISTS (SELECT 1 FROM sleeve_genius_traversal frontier
        WHERE frontier.song_id=CAST(json_extract(source.content,'$.identity.providerId') AS TEXT))
    ORDER BY source.retrieved_at DESC,source.id DESC`).all();
  const selected = [], seen = new Set();
  for (const row of rows) {
    const result = JSON.parse(row.content);
    const identity = result.identity;
    if (!identity || !/^\d+$/.test(String(identity.providerId)) || seen.has(String(identity.providerId))) continue;
    if (!Array.isArray(result.relationships) || !result.relationships.some(link =>
      ['samples','sampled_in'].includes(link.type) && geniusTraversalArtistAllowed(link.target?.artist ?? null))) continue;
    seen.add(String(identity.providerId));
    selected.push({ recording: { id: row.id, title: identity.title, artist: identity.artist ?? null }, result });
    if (selected.length === 25) break;
  }
  db.transaction(() => {
    for (const item of selected) registerGeniusTraversal(item.recording,item.result);
  })();
  console.log(`Queued ${selected.length} saved Genius songs for sample expansion. No API calls made by this command.`);
  console.log(db.prepare(`SELECT capability,state,COUNT(*) AS jobs FROM sleeve_research_jobs
    WHERE provider='genius' AND state IN ('queued','retry-at','running') GROUP BY capability,state`).all());
} finally { db.close(); }
