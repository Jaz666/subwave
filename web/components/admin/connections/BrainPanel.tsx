'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/** CSS keeps desktop controls open and mobile controls closed from first paint. */
export default function BrainPanel({ label, className, children }: { label: string; className: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return <div className={className}>
    <button type="button" aria-expanded={open} aria-controls={contentId}
      onClick={() => setOpen(value => !value)}
      className="flex min-h-11 items-center gap-2 px-2 text-[11px] hover:bg-overlay md:hidden">
      {label}{open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
    </button>
    <div id={contentId} className={open ? 'block' : 'hidden md:block'}>{children}</div>
  </div>;
}
