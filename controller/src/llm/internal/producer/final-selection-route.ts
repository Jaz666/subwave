import { personaFinalCallDecision, type PersonaFinalCallInput } from "./persona-final-call.js";
export type FinalSelectionRoute = { kind:"functiongemma"; id:string } | { kind:"persona-final-call"; reasons:string[] };
export function routeFinalSelection(input: PersonaFinalCallInput): FinalSelectionRoute { const decision=personaFinalCallDecision(input); return decision.escalate?{kind:"persona-final-call",reasons:decision.reasons}:{kind:"functiongemma",id:input.proposedId!}; }
