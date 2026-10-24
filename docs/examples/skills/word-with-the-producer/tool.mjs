// Only choose the participants. The prompt and their souls supply the conversation.
export const description = 'Bring Producer Dave into a short conversation with the current host. No prepared topics or dialogue.';
export const requiresData = true;
export const ready = services => typeof services.personas?.find === 'function' && typeof services.personas?.onAirHost === 'function';

export default async function wordWithTheProducer(ctx, state, services) {
  if (!ready(services)) return { available: false, reason: 'Persona lookup service unavailable' };
  const host = services.personas.onAirHost();
  const guest = services.personas.find('Producer Dave');
  if (!host || !guest || host.id === guest.id) return { available: false, reason: 'A distinct host and an unambiguous Producer Dave persona are required' };
  return { available: true, speakerIds: [guest.id, host.id], turnCount: 4,
    onAirHost: host, specialGuest: guest, fictionalPremise: true };
}
