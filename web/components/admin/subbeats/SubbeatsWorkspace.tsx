'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { z } from 'zod';
import { usePathname } from 'next/navigation';
import { subbeatsBrowseStatusSchema, subbeatsMixFilterSchema, subbeatsSortSchema } from '../../../lib/schemas.generated';
import type { SubbeatsCandidate } from '../library/subbeats-selection';

export type SubbeatsPage = 'explore' | 'preparation' | 'prepared' | 'preview' | 'cache';
export type SubbeatsBrowseState = {
  mixing: z.infer<typeof subbeatsMixFilterSchema>;
  sort: z.infer<typeof subbeatsSortSchema>;
  query: string; offset: number; genre: string;
  scope: 'dance' | 'library' | 'prepared';
  status: 'all' | z.infer<typeof subbeatsBrowseStatusSchema>;
};
export const subbeatsInitialBrowse = (scope: SubbeatsBrowseState['scope']): SubbeatsBrowseState => ({
  mixing: 'all', sort: 'recommended', query: '', offset: 0, genre: '', scope, status: 'all',
});

function useWorkspaceState() {
  const pathname = usePathname();
  const [restoredPath, setRestoredPath] = useState('');
  const browsePage = pathname === '/admin/library/subbeats' ? 'explore' : pathname === '/admin/library/subbeats/prepared' ? 'prepared' : null;
  const [selected, setSelected] = useState<SubbeatsCandidate[]>([]);
  const [browse, setBrowse] = useState({ explore: subbeatsInitialBrowse('dance'), prepared: subbeatsInitialBrowse('prepared') });
  const [jobSelected, setJobSelected] = useState<string[]>([]);
  const [jobQuery, setJobQuery] = useState('');
  const [jobSort, setJobSort] = useState('priority');
  const [jobStatus, setJobStatus] = useState('all');
  const [jobPage, setJobPage] = useState(0);
  const [previewSearch, setPreviewSearch] = useState('');
  const [outgoing, setOutgoing] = useState('');
  const [incoming, setIncoming] = useState('');
  const [barShift, setBarShift] = useState(0);
  const [preparationMethod, setPreparationMethod] = useState<'classic'|'small0'|'final0'>('classic');
  const [previewMethod, setPreviewMethod] = useState<'stems'|'cue-points'>('stems');
  const [outCueIndex, setOutCueIndex] = useState(0);
  const [inCueIndex, setInCueIndex] = useState(0);
  // Match Library's replaceState convention: filters survive refresh/bookmarks,
  // while bulk selections stay temporary. Keep each sub-page's filters separate.
  useEffect(() => {
    if (browsePage) {
      const params = new URLSearchParams(window.location.search);
      if (['q', 'genre', 'scope', 'status', 'offset', 'sort', 'mixing'].some(key => params.has(key))) {
        const sort = subbeatsSortSchema.safeParse(params.get('sort') ?? 'recommended');
        const status = subbeatsBrowseStatusSchema.safeParse(params.get('status') ?? 'all');
        const mixing = subbeatsMixFilterSchema.safeParse(params.get('mixing') ?? 'all');
        const offset = Number(params.get('offset') ?? 0);
        setBrowse(current => ({ ...current, [browsePage]: {
          mixing: mixing.success ? mixing.data : 'all',
          sort: sort.success ? sort.data : 'recommended',
          query: (params.get('q') ?? '').slice(0, 200),
          genre: (params.get('genre') ?? '').slice(0, 200),
          scope: browsePage === 'prepared' ? 'prepared' : params.get('scope') === 'library' ? 'library' : 'dance',
          status: browsePage === 'prepared' ? 'all' : status.success ? status.data : 'all',
          offset: Number.isSafeInteger(offset) && offset >= 0 && offset <= 1_000_000 ? offset : 0,
        } }));
      }
    }
    setRestoredPath(pathname);
  }, [pathname, browsePage]);
  useEffect(() => {
    if (!browsePage || restoredPath !== pathname) return;
    const current = browse[browsePage];
    const params = new URLSearchParams(window.location.search);
    for (const key of ['q', 'genre', 'scope', 'status', 'offset', 'sort', 'mixing']) params.delete(key);
    if (current.query.trim()) params.set('q', current.query.trim());
    if (current.sort !== 'recommended') params.set('sort', current.sort);
    if (current.mixing !== 'all') params.set('mixing', current.mixing);
    if (current.genre) params.set('genre', current.genre);
    if (current.scope === 'library') params.set('scope', 'library');
    if (current.status !== 'all') params.set('status', current.status);
    if (current.offset) params.set('offset', String(current.offset));
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, [browse, browsePage, pathname, restoredPath]);
  return { preparationMethod, setPreparationMethod, previewMethod, setPreviewMethod, outCueIndex, setOutCueIndex, inCueIndex, setInCueIndex, browseRestored: restoredPath === pathname, jobSelected, setJobSelected, selected, setSelected, browse, setBrowse, jobQuery, setJobQuery, jobStatus, setJobStatus,
    jobSort, setJobSort, jobPage, setJobPage, previewSearch, setPreviewSearch, outgoing, setOutgoing, incoming, setIncoming, barShift, setBarShift };
}

const Workspace = createContext<ReturnType<typeof useWorkspaceState> | null>(null);

// The nested Library layout owns only in-memory operator choices. Audition audio
// stays in its page hook, whose unmount cancels playback and in-flight rendering.
export function SubbeatsWorkspace({ children }: { children: ReactNode }) {
  return <Workspace.Provider value={useWorkspaceState()}>{children}</Workspace.Provider>;
}

export function useSubbeatsWorkspace() {
  const workspace = useContext(Workspace);
  if (!workspace) throw new Error('Sub/Beats pages require the Library workspace');
  return workspace;
}
