export type CallPrivacy = 'everyone' | 'following' | 'nobody';

export interface CallSettings {
  allowCallsFrom: CallPrivacy;
  videoCallsEnabled: boolean;
  speakerByDefault: boolean;
  showSafetyTips: boolean;
  parentalAck: boolean;
}

const KEY = 'yolustu_call_settings_v1';

export const TEEN_SAFETY_RULES = [
  'Yolüstü yalnız 13+ üçündür. 13–18 yaş valideyn icazəsi ilə.',
  'Tanımadiğın insanlarla video zəng etmə — əvvəl söhbət et.',
  'Narahat edən mesaj/zəng → blokla və şikayət et.',
  'Şəxsi məlumat (ünvan, məktəb) paylaşma.',
  'Təcili halda valideyn və ya etibar etdiyin böyüyə müraciət et.',
];

export function getCallSettings(): CallSettings {
  if (typeof window === 'undefined') {
    return defaultSettings();
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings();
    return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch {
    return defaultSettings();
  }
}

export function saveCallSettings(patch: Partial<CallSettings>): CallSettings {
  const next = { ...getCallSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('yolustu_call_settings'));
  return next;
}

function defaultSettings(): CallSettings {
  return {
    allowCallsFrom: 'everyone',
    videoCallsEnabled: true,
    speakerByDefault: true,
    showSafetyTips: true,
    parentalAck: true,
  };
}
