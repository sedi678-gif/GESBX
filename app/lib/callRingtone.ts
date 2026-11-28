/** Zəng səsləri Web Audio ilə yaradılır; ayrıca media faylı tələb etmir. */

let audioCtx: AudioContext | null = null;
let ringTimer: ReturnType<typeof setInterval> | null = null;
let pulseTimer: ReturnType<typeof setInterval> | null = null;
let activeOscillators: OscillatorNode[] = [];

function stopOscillators() {
  activeOscillators.forEach((osc) => {
    try { osc.stop(); osc.disconnect(); } catch { /* artıq dayanıb */ }
  });
  activeOscillators = [];
}

function playTone(freq: number, durationMs: number, ctx: AudioContext, startAt: number, volume = 0.16) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.025);
  gain.gain.setValueAtTime(volume, Math.max(startAt + 0.03, startAt + durationMs / 1000 - 0.04));
  gain.gain.linearRampToValueAtTime(0, startAt + durationMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + durationMs / 1000 + 0.06);
  activeOscillators.push(osc);
}

function stopTonePlayback() {
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
  stopOscillators();
  if (audioCtx) {
    const old = audioCtx;
    audioCtx = null;
    void old.close().catch((error: unknown) => console.debug('[callRingtone] Audio context close failed.', error));
  }
}

function createAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return Ctx ? new Ctx() : null;
}

function playIncomingBurst() {
  if (!audioCtx || audioCtx.state === 'closed') return;
  const now = audioCtx.currentTime;
  playTone(440, 420, audioCtx, now, 0.13);
  playTone(480, 420, audioCtx, now + 0.46, 0.13);
}

function playRingbackBurst() {
  if (!audioCtx || audioCtx.state === 'closed') return;
  // Klassik telefon çağırış tonu: 425 Hz, təxminən 1 saniyə səs və fasilə.
  playTone(425, 950, audioCtx, audioCtx.currentTime, 0.12);
}

export async function startRingtone(): Promise<void> {
  stopTonePlayback();
  try {
    audioCtx = createAudioContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    playIncomingBurst();
    ringTimer = setInterval(playIncomingBurst, 2400);
  } catch {
    stopTonePlayback();
  }
}

/** Zəng edən tərəfdə qarşı tərəfin cavabını gözləyərkən eşidilən xətt tonu. */
export async function startRingback(): Promise<void> {
  stopTonePlayback();
  try {
    audioCtx = createAudioContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    playRingbackBurst();
    ringTimer = setInterval(playRingbackBurst, 4500);
  } catch {
    stopTonePlayback();
  }
}

export function stopRingtone(): void {
  stopTonePlayback();
  stopCallPulse();
}

export function startCallPulse(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  stopCallPulse();
  navigator.vibrate([400, 180, 400, 180, 400, 1200]);
  pulseTimer = setInterval(() => navigator.vibrate?.([400, 180, 400, 180, 400, 1200]), 2400);
}

export function stopCallPulse(): void {
  if (pulseTimer) clearInterval(pulseTimer);
  pulseTimer = null;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(0);
}
