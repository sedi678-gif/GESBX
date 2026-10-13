import React from 'react';

function GameSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
      {children}
    </svg>
  );
}

export function IconMapQuest() {
  return (
    <GameSvg>
      <path
        d="M7 3.8h10A2.2 2.2 0 0119.2 6v14.4L12 17.2l-7.2 3.2V6A2.2 2.2 0 017 3.8z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M9 9h6M9 12.4h4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </GameSvg>
  );
}

export function IconMapFortress() {
  return (
    <GameSvg>
      <path
        d="M4.6 20V9.2l2.4-1.9V5.2h2v2.1h2.1V5.2h2.2v2.1H15V5.2h2v2.1l2.4 1.9V20H4.6z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M10.2 20v-5h3.6v5" stroke="currentColor" strokeWidth="1.7" />
    </GameSvg>
  );
}

export function IconMapFlag() {
  return (
    <GameSvg>
      <path d="M6.2 3.6v16.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M6.2 4.4h9.6l-1.8 3.7 1.8 3.7H6.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </GameSvg>
  );
}

export function IconMapAttack() {
  return (
    <GameSvg>
      <path
        d="M14.8 4.2l5 5-8.4 8.4-5.2.8.8-5.2 7.8-9z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M4.4 19.6l4.2-4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </GameSvg>
  );
}

export function IconMapAd() {
  return (
    <GameSvg>
      <path
        d="M8.2 7.2v9.6L16.8 12 8.2 7.2z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </GameSvg>
  );
}

export function IconMapRank() {
  return (
    <GameSvg>
      <path d="M7.2 20V11.2h3.4V20H7.2zM13.4 20V8h3.4v12h-3.4zM4.4 20v-5.2H7V20H4.4z" fill="currentColor" />
      <path d="M12 3.4l1.15 2.33 2.57.37-1.86 1.81.44 2.56L12 9.2l-2.3 1.21.44-2.56-1.86-1.81 2.57-.37L12 3.4z" fill="currentColor" />
    </GameSvg>
  );
}

export function IconMapCards() {
  return (
    <GameSvg>
      <rect x="4.4" y="6.2" width="11.2" height="13.2" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.4 4.6h11.2A1.6 1.6 0 0121.2 6.2v11.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </GameSvg>
  );
}

export function IconMapGlobe() {
  return (
    <GameSvg>
      <circle cx="12" cy="12" r="7.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 4.6c2.2 2.1 3.4 4.7 3.4 7.4S14.2 17.3 12 19.4M12 4.6C9.8 6.7 8.6 9.3 8.6 12s1.2 5.3 3.4 7.4M4.8 12h14.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </GameSvg>
  );
}

export function IconMapArmy() {
  return (
    <GameSvg>
      <path
        d="M8.2 4.2l.9 3.4-2.4 2.4 7.3 7.3 2.4-2.4 3.4.9-.9 3.4-6.2-.4-7.1-7.1-.4-6.2 3 1.1z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M5.2 18.8l3.2-3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </GameSvg>
  );
}

export function IconMapCrown() {
  return (
    <GameSvg>
      <path
        d="M4.4 17.6h15.2M5 17.6l-.8-9.2 4.4 3.2L12 5.4l3.4 6.2 4.4-3.2-.8 9.2H5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </GameSvg>
  );
}

export function IconMapShield() {
  return (
    <GameSvg>
      <path
        d="M12 3.6l7.2 2.4v6.2c0 4.2-2.8 7.2-7.2 8.4-4.4-1.2-7.2-4.2-7.2-8.4V6L12 3.6z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M12 8.2v7.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </GameSvg>
  );
}
