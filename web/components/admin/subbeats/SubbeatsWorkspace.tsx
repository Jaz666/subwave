'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { z } from 'zod';
import type { subbeatsBrowseStatusSchema } from '../../../lib/schemas.generated';
import type { SubbeatsCandidate } from '../library/subbeats-selection';

export type SubbeatsPage = 'explore' | 'preparation' | 'prepared' | 'preview';
export type SubbeatsBrowseState = {
  query: string; offset: number; genre: string;
  scope: 'dance' | 'library' | 'prepared';
  status: 'all' | z.infer<typeof subbeatsBrowseStatusSchema>;
};
export const subbeatsInitialBrowse = (scope: SubbeatsBrowseState['scope']): SubbeatsBrowseState => ({
  query: '', offset: 0, genre: '', scope, status: 'all',
});

function useWorkspaceState() {
  const [selected, setSelected] = useState<SubbeatsCandidate[]>([]);
  const [browse, setBrowse] = useState({ explore: subbeatsInitialBrowse('dance'), prepared: subbeatsInitialBrowse('prepared') });
  const [jobQuery, setJobQuery] = useState('');
  const [jobStatus, setJobStatus] = useState('all');
  const [jobPage, setJobPage] = useState(0);
  const [previewSearch, setPreviewSearch] = useState('');
  const [outgoing, setOutgoing] = useState('');
  const [incoming, setIncoming] = useState('');
  const [barShift, setBarShift] = useState(0);
  return { selected, setSelected, browse, setBrowse, jobQuery, setJobQuery, jobStatus, setJobStatus,
    jobPage, setJobPage, previewSearch, setPreviewSearch, outgoing, setOutgoing, incoming, setIncoming, barShift, setBarShift };
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
