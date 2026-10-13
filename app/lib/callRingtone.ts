/** Gələn zəng melodiyası — Web Audio ilə (asset lazım deyil) */

let audioCtx: AudioContext | null = null;
let ringTimer: ReturnType<typeof setInterval> | null = null;
let pulseTimer: ReturnType<typeof setInterval> | null = null;
let activeOscillators: OscillatorNode[] = [];

function stopOscillators() {
  activeOscillators.forEach((osc) => {
    try {
      osc.stop();
      osc.disconnect();
    } catch {
      /* already stopped */
    }
  });
  activeOscillators = [];
}

function playTone(freq: number, durationMs: number, ctx: AudioContext, startAt: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.18, startAt + 0.02);
  gain.gain.linearRampToValueAtTime(0, startAt + durationMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + durationMs / 1000 + 0.05);
  activeOscillators.push(osc);
}

function playRingBurst() {
  if (!audioCtx || audioCtx.state === 'closed') return;
  const now = audioCtx.currentTime;
  playTone(440, 400, audioCtx, now);
  playTone(480, 400, audioCtx, now + 0.45);
}

export async function startRingtone(): Promise<void> {
  if (typeof window === 'undefined') return;
  stopRingtone();

  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    playRingBurst();
    ringTimer = setInterval(playRingBurst, 2200);
  } catch {
    /* ignore */
  }
}

export function stopRingtone(): void {
  if (ringTimer) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
  stopOscillators();
  if (audioCtx) {
    void audioCtx.close().catch(() => undefined);
    audioCtx = null;
  }
  stopCallPulse();
}

export function startCallPulse(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  stopCallPulse();
  navigator.vibrate([400, 180, 400, 180, 400, 1200]);
  pulseTimer = setInterval(() => {
    navigator.vibrate?.([400, 180, 400, 180, 400, 1200]);
  }, 2400);
}

export function stopCallPulse(): void {
  if (pulseTimer) {
    clearInterval(pulseTimer);
    pulseTimer = null;
  }
  navigator.vibrate?.(0);
}
