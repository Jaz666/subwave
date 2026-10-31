import type { ReactNode } from 'react';
import { SubbeatsWorkspace } from '../../../../components/admin/subbeats/SubbeatsWorkspace';

export default function SubbeatsLayout({ children }: { children: ReactNode }) {
  return <SubbeatsWorkspace>{children}</SubbeatsWorkspace>;
}
