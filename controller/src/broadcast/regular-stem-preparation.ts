/** Single CPU preparation lane, independent of the queue's sender lock.
 * The queue supplies its latest ordered needs on every change/tick. A running
 * Demucs job is not preemptible; obsolete results never wake/arm a stale seam.
 * Successful windows are retained only while wanted; failures retry only after
 * that need leaves the snapshot, avoiding a hot retry loop on broken audio.
 */
export interface RegularStemNeed {
  key: string; // recording + window + extraction version, not just track ID
  trackId: string;
  side: 'head' | 'tail';
  deadlineMs: number; // absolute safe preparation deadline, before render/handoff
}

export class RegularStemPreparation {
  private wanted = new Map<string, RegularStemNeed>();
  private settled = new Map<string, 'ready' | 'failed'>();
  private running: RegularStemNeed | null = null;
  private pumping = false;

  constructor(private readonly options: {
    run: (need: RegularStemNeed) => Promise<boolean | 'deferred'>;
    ready: (need: RegularStemNeed) => void;
    failed: (need: RegularStemNeed, error: unknown) => void;
    now?: () => number;
    available?: () => boolean;
  }) {}

  /** Order is queue urgency: nearest outgoing tail, its eligible incoming
   * head, then later tails. New additions cannot jump ahead of earlier needs.
   * Invalid/unknown clocks are omitted by the caller and rejected here too.
   */
  update(needs: readonly RegularStemNeed[]): void {
    const now = this.now();
    this.wanted = new Map(needs.filter(need => Number.isFinite(need.deadlineMs)
      && need.deadlineMs > now).map(need => [need.key, { ...need }]));
    for (const key of this.settled.keys()) if (!this.wanted.has(key)) this.settled.delete(key);
    void this.pump();
  }

  state(key: string): 'pending' | 'running' | 'ready' | 'failed' | 'absent' {
    const need = this.wanted.get(key);
    if (!need || need.deadlineMs <= this.now()) return 'absent';
    return this.settled.get(key) ?? (this.running?.key === key ? 'running' : 'pending');
  }

  private now(): number { return this.options.now?.() ?? Date.now(); }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (true) {
        if (this.options.available?.() === false) return;
        const need = [...this.wanted.values()].find(item => !this.settled.has(item.key)
          && item.deadlineMs > this.now());
        if (!need) return;
        this.running = need;
        let ok: boolean | 'deferred' = false;
        let error: unknown = null;
        try { ok = await this.options.run(need); }
        catch (caught) { error = caught; }
        this.running = null;
        if (ok === 'deferred') return; // retry at a later queue tick, never spin
        const current = this.wanted.get(need.key);
        // Queue mutation, skip or handoff while separation ran. No stale
        // callback may turn a committed ordinary crossfade into a blend.
        if (!current || current.deadlineMs <= this.now()) continue;
        this.settled.set(need.key, ok ? 'ready' : 'failed');
        try {
          if (ok) this.options.ready(current);
          else this.options.failed(current, error);
        } catch { /* diagnostics/wakeup must never wedge the preparation lane */ }
      }
    } finally {
      this.running = null;
      this.pumping = false;
    }
  }
}
