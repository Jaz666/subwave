'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { z } from 'zod';
import { usePathname } from 'next/navigation';
import { subbeatsBrowseStatusSchema, subbeatsMixFilterSchema, subbeatsSortSchema } from '../../../lib/schemas.generated';
import type { SubbeatsCandidate } from '../library/subbeats-selection';

export type SubbeatsPage = 'explore' | 'preparation' | 'prepared' | 'preview' | 'cache';
export type SubbeatsCueFilter = 'all' | 'missing-incoming' | 'missing-outgoing' | 'no-cues' | 'unmeasurable';
export type SubbeatsBrowseState = {
  mixing: z.infer<typeof subbeatsMixFilterSchema>;
  sort: z.infer<typeof subbeatsSortSchema>;
  query: string; offset: number; genre: string; playlistId:string;
  scope: 'dance' | 'library' | 'prepared' | 'playlist';
  status: 'all' | z.infer<typeof subbeatsBrowseStatusSchema>;
};
export const subbeatsInitialBrowse = (scope: SubbeatsBrowseState['scope']): SubbeatsBrowseState => ({
  mixing: 'all', sort: 'recommended', query: '', offset: 0, genre: '', playlistId:'', scope, status: 'all',
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
  const [jobCueFilter, setJobCueFilter] = useState<SubbeatsCueFilter>('all');
  const [jobPage, setJobPage] = useState(0);
  const [previewSearch, setPreviewSearch] = useState('');
  const [outgoing, setOutgoing] = useState('');
  const [incoming, setIncoming] = useState('');
  const [preparationMethod, setPreparationMethod] = useState<'classic'|'small0'|'final0'>('small0');
  const [outCueIndex, setOutCueIndex] = useState(0);
  const [inCueIndex, setInCueIndex] = useState(0);
  // Match Library's replaceState convention: filters survive refresh/bookmarks,
  // while bulk selections stay temporary. Keep each sub-page's filters separate.
  useEffect(() => {
    if (browsePage) {
      const params = new URLSearchParams(window.location.search);
      if (['q', 'genre', 'scope', 'status', 'offset', 'sort', 'mixing', 'playlistId'].some(key => params.has(key))) {
        const sort = subbeatsSortSchema.safeParse(params.get('sort') ?? 'recommended');
        const status = subbeatsBrowseStatusSchema.safeParse(params.get('status') ?? 'all');
        const mixing = subbeatsMixFilterSchema.safeParse(params.get('mixing') ?? 'all');
        const offset = Number(params.get('offset') ?? 0);
        setBrowse(current => ({ ...current, [browsePage]: {
          mixing: mixing.success ? mixing.data : 'all',
          sort: sort.success ? sort.data : 'recommended',
          query: (params.get('q') ?? '').slice(0, 200),
          genre: (params.get('genre') ?? '').slice(0, 200),
          playlistId:browsePage === 'explore' ? (params.get('playlistId') ?? '').slice(0,200) : '',
          scope: browsePage === 'prepared' ? 'prepared' : params.get('scope') === 'library' ? 'library' : params.get('scope') === 'playlist' ? 'playlist' : 'dance',
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
    for (const key of ['q', 'genre', 'scope', 'status', 'offset', 'sort', 'mixing', 'playlistId']) params.delete(key);
    if (current.query.trim()) params.set('q', current.query.trim());
    if (current.sort !== 'recommended') params.set('sort', current.sort);
    if (current.mixing !== 'all') params.set('mixing', current.mixing);
    if (current.genre) params.set('genre', current.genre);
    if (current.scope === 'library' || current.scope === 'playlist') params.set('scope', current.scope);
    if (current.scope === 'playlist' && current.playlistId) params.set('playlistId',current.playlistId);
    if (current.status !== 'all') params.set('status', current.status);
    if (current.offset) params.set('offset', String(current.offset));
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, [browse, browsePage, pathname, restoredPath]);
  return { preparationMethod, setPreparationMethod, outCueIndex, setOutCueIndex, inCueIndex, setInCueIndex, browseRestored: restoredPath === pathname, jobSelected, setJobSelected, selected, setSelected, browse, setBrowse, jobQuery, setJobQuery, jobStatus, setJobStatus, jobCueFilter, setJobCueFilter,
    jobSort, setJobSort, jobPage, setJobPage, previewSearch, setPreviewSearch, outgoing, setOutgoing, incoming, setIncoming };
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
