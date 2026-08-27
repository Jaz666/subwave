import type { PredictedToolCall } from "./contracts.js";
export const CONTROLLER_SELECTION_TRANSITION = "normal" as const;
export interface ControllerSelection { id: string; transition: typeof CONTROLLER_SELECTION_TRANSITION; }
/** The selector owns the grounded candidate id. The controller owns the safe transition default. */
export function resolveControllerSelection(calls: readonly PredictedToolCall[], surfacedIds: readonly string[]): ControllerSelection | null { const call=[...calls].reverse().find(item=>item.name==="done"); const id=typeof call?.arguments?.id==="string"?call.arguments.id:""; return surfacedIds.includes(id)?{id,transition:CONTROLLER_SELECTION_TRANSITION}:null; }
