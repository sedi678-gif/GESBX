'use client';

import { APP_LANGUAGES } from '@/app/lib/appLanguage';
import { useSettings } from '@/context/SettingsContext';

export default function LanguageSwitch({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { language, setLanguage } = useSettings();

  return (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: 'flex',
        gap: compact ? 4 : 6,
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}
    >
      {APP_LANGUAGES.map((code) => {
        const active = language === code;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={active}
            onClick={() => setLanguage(code)}
            style={{
              minWidth: compact ? 36 : 42,
              height: compact ? 28 : 32,
              padding: '0 8px',
              borderRadius: 8,
              border: active ? '1px solid rgba(34,211,238,0.7)' : '1px solid rgba(148,163,184,0.25)',
              background: active ? 'rgba(34,211,238,0.2)' : 'rgba(15,23,42,0.7)',
              color: '#e2e8f0',
              fontWeight: active ? 800 : 500,
              fontSize: 12,
              letterSpacing: 0.04,
              cursor: 'pointer',
            }}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
