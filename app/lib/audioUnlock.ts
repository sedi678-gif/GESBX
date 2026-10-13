/** Mobil brauzer/WebView-də zəng səsini aktivləşdirir (user gesture sonrası) */

let heldCtx: AudioContext | null = null;

function getAudioContextClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
}

export async function unlockCallAudio(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const Ctx = getAudioContextClass();
    if (Ctx) {
      if (!heldCtx || heldCtx.state === 'closed') heldCtx = new Ctx();
      if (heldCtx.state === 'suspended') await heldCtx.resume();
      const buffer = heldCtx.createBuffer(1, 1, 22050);
      const source = heldCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(heldCtx.destination);
      source.start(0);
    }
  } catch {
    /* ignore */
  }

  try {
    let el = document.getElementById('yolustu-remote-audio') as HTMLAudioElement | null;
    if (!el) {
      el = document.createElement('audio');
      el.id = 'yolustu-remote-audio';
      el.autoplay = true;
      el.setAttribute('playsinline', 'true');
      el.setAttribute('webkit-playsinline', 'true');
      el.muted = false;
      el.volume = 1;
      el.style.cssText = 'position:fixed;width:2px;height:2px;opacity:0.02;pointer-events:none;z-index:3;';
      document.documentElement.appendChild(el);
    }
    if (!el.srcObject && !el.src) {
      el.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    }
    el.muted = false;
    await el.play();
  } catch {
    /* ignore */
  }
}

export function releaseCallAudioUnlock(): void {
  if (heldCtx) {
    void heldCtx.close().catch(() => undefined);
    heldCtx = null;
  }
}

export async function bindStreamToSpeaker(
  el: HTMLMediaElement | null,
  stream: MediaStream | null,
  useSpeaker: boolean
): Promise<void> {
  if (!el || !stream) return;
  el.srcObject = stream;
  el.volume = 1;
  try {
    const sink = el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
    if (useSpeaker && typeof sink.setSinkId === 'function') {
      await sink.setSinkId('default');
    }
    await el.play();
  } catch {
    /* autoplay */
  }
}
