import React from 'react';

function CallSvg({
  size,
  children,
}: {
  size: number;
  children: React.ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function Slash() {
  return (
    <path
      d="M4.2 4.2l15.6 15.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  );
}

export function IconCallPhone({ size = 28 }: { size?: number }) {
  return (
    <CallSvg size={size}>
      <path d="M7.05 11.32c1.62 3.17 4.46 5.96 7.63 7.52l2.48-2.48a1.2 1.2 0 011.16-.3c1.26.4 2.61.62 3.98.62.66 0 1.2.54 1.2 1.2V21.2c0 .66-.54 1.2-1.2 1.2C11.3 22.4 1.6 12.7 1.6 1.7 1.6 1.04 2.14.5 2.8.5h3.32c.66 0 1.2.54 1.2 1.2 0 1.37.22 2.72.62 3.98a1.2 1.2 0 01-.3 1.16L7.05 11.32z" />
    </CallSvg>
  );
}

export function IconCallHangup({ size = 28 }: { size?: number }) {
  return (
    <CallSvg size={size}>
      <g transform="rotate(135 12 12)">
        <path d="M7.05 11.32c1.62 3.17 4.46 5.96 7.63 7.52l2.48-2.48a1.2 1.2 0 011.16-.3c1.26.4 2.61.62 3.98.62.66 0 1.2.54 1.2 1.2V21.2c0 .66-.54 1.2-1.2 1.2C11.3 22.4 1.6 12.7 1.6 1.7 1.6 1.04 2.14.5 2.8.5h3.32c.66 0 1.2.54 1.2 1.2 0 1.37.22 2.72.62 3.98a1.2 1.2 0 01-.3 1.16L7.05 11.32z" />
      </g>
    </CallSvg>
  );
}

export function IconCallMic({ size = 24 }: { size?: number }) {
  return (
    <CallSvg size={size}>
      <path d="M12 2.4a3.4 3.4 0 00-3.4 3.4v6.2a3.4 3.4 0 006.8 0V5.8A3.4 3.4 0 0012 2.4z" />
      <path d="M6.2 11.2a5.8 5.8 0 0011.6 0h1.7a7.5 7.5 0 01-6.65 7.42V20.4h2.35V22H8.8v-1.6h2.35v-1.78A7.5 7.5 0 014.5 11.2h1.7z" />
    </CallSvg>
  );
}

export function IconCallMicOff({ size = 24 }: { size?: number }) {
  return (
    <CallSvg size={size}>
      <path d="M12 2.4a3.4 3.4 0 00-3.4 3.4v.86l5.95 5.95A3.38 3.38 0 0015.4 11.6V5.8A3.4 3.4 0 0012 2.4z" />
      <path d="M8.6 12.55V11.6a3.38 3.38 0 01.28-1.35l-1.5-1.5A5.77 5.77 0 006.2 11.2h-1.7a7.5 7.5 0 005.15 7.1V20.4H7.3V22h8.4v-1.6h-2.35v-1.78c.5-.1.97-.26 1.42-.46l-1.48-1.48A5.8 5.8 0 018.6 12.55z" />
      <Slash />
    </CallSvg>
  );
}

export function IconCallSpeaker({ size = 24 }: { size?: number }) {
  return (
    <CallSvg size={size}>
      <path d="M4 9.2h2.7L11.4 5v14L6.7 14.8H4A1.2 1.2 0 012.8 13.6V10.4A1.2 1.2 0 014 9.2z" />
      <path d="M15.15 8.05a4.4 4.4 0 010 7.9 1.05 1.05 0 101.1 1.79 6.5 6.5 0 000-11.48 1.05 1.05 0 10-1.1 1.79z" />
      <path d="M17.7 5.2a8.2 8.2 0 010 13.6 1.05 1.05 0 101.1 1.79 10.3 10.3 0 000-17.18 1.05 1.05 0 10-1.1 1.79z" />
    </CallSvg>
  );
}

export function IconCallSpeakerOff({ size = 24 }: { size?: number }) {
  return (
    <CallSvg size={size}>
      <path d="M4 9.2h2.7L11.4 5v14L6.7 14.8H4A1.2 1.2 0 012.8 13.6V10.4A1.2 1.2 0 014 9.2z" />
      <path d="M15.15 8.05a4.4 4.4 0 010 7.9 1.05 1.05 0 101.1 1.79 6.5 6.5 0 000-11.48 1.05 1.05 0 10-1.1 1.79z" />
      <Slash />
    </CallSvg>
  );
}

export function IconCallVideo({ size = 24 }: { size?: number }) {
  return (
    <CallSvg size={size}>
      <path d="M3.2 7.4A2.4 2.4 0 015.6 5h8.4a2.4 2.4 0 012.4 2.4v9.2a2.4 2.4 0 01-2.4 2.4H5.6a2.4 2.4 0 01-2.4-2.4V7.4z" />
      <path d="M17.6 9.55l3.05-1.83A1.15 1.15 0 0122.4 8.7v6.6a1.15 1.15 0 01-1.75.98L17.6 14.45V9.55z" />
    </CallSvg>
  );
}

export function IconCallVideoOff({ size = 24 }: { size?: number }) {
  return (
    <CallSvg size={size}>
      <path d="M3.2 7.4A2.4 2.4 0 015.6 5h.86l8.14 8.14v3.46a2.4 2.4 0 01-2.4 2.4H5.6a2.4 2.4 0 01-2.4-2.4V7.4z" />
      <path d="M17.6 9.55l3.05-1.83A1.15 1.15 0 0122.4 8.7v6.6a1.15 1.15 0 01-1.75.98L17.6 14.45V9.55z" />
      <Slash />
    </CallSvg>
  );
}

export function IconCallMore({ size = 24 }: { size?: number }) {
  return (
    <CallSvg size={size}>
      <circle cx="6" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18" cy="12" r="1.7" />
    </CallSvg>
  );
}

export function IconCallShare({ size = 24 }: { size?: number }) {
  return (
    <CallSvg size={size}>
      <path d="M12 3.2v10.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8.2 6.6L12 3.2l3.8 3.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.2 12.5v5.3A2 2 0 007.2 20h9.6a2 2 0 002-2.2v-5.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </CallSvg>
  );
}

export function IconCallMinimize({ size = 22 }: { size?: number }) {
  return (
    <CallSvg size={size}>
      <path d="M8 4.5H4.8A1.3 1.3 0 003.5 5.8V9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 19.5h3.2a1.3 1.3 0 001.3-1.3V15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14.5 9.5l6-6M9.5 14.5l-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </CallSvg>
  );
}

export function IconCallLock({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17 9h-1V7A4 4 0 007 7v2H6a2 2 0 00-2 2v8a2 2 0 002 2h11a2 2 0 002-2v-8a2 2 0 00-2-2zm-8-2a2 2 0 114 0v2H9V7z" />
    </svg>
  );
}

export function IconCallInvite({ size = 24 }: { size?: number }) {
  return (
    <CallSvg size={size}>
      <path d="M10.2 12.1c2.15 0 3.9-1.82 3.9-4.05S12.35 4 10.2 4 6.3 5.82 6.3 8.05s1.75 4.05 3.9 4.05z" />
      <path d="M3.4 19.3c0-2.92 3.05-5.15 6.8-5.15 1.18 0 2.29.22 3.26.62A4.6 4.6 0 0012.2 17c0 .9.24 1.74.66 2.47l.14.23H3.4v-.4z" />
      <path d="M18.1 13.15a.95.95 0 00-1.9 0V15.4h-2.2a.95.95 0 000 1.9h2.2v2.25a.95.95 0 001.9 0V17.3h2.2a.95.95 0 000-1.9h-2.2v-2.25z" />
    </CallSvg>
  );
}
