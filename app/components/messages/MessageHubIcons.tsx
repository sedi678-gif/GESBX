import React from 'react';

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function IconBack() {
  return (
    <svg {...iconProps}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function IconPhone() {
  return (
    <svg {...iconProps} fill="currentColor" stroke="none">
      <path d="M7.05 11.32c1.62 3.17 4.46 5.96 7.63 7.52l2.48-2.48a1.2 1.2 0 011.16-.3c1.26.4 2.61.62 3.98.62.66 0 1.2.54 1.2 1.2V21.2c0 .66-.54 1.2-1.2 1.2C11.3 22.4 1.6 12.7 1.6 1.7 1.6 1.04 2.14.5 2.8.5h3.32c.66 0 1.2.54 1.2 1.2 0 1.37.22 2.72.62 3.98a1.2 1.2 0 01-.3 1.16L7.05 11.32z" />
    </svg>
  );
}

export function IconVideo() {
  return (
    <svg {...iconProps} fill="currentColor" stroke="none">
      <path d="M3.2 7.4A2.4 2.4 0 015.6 5h8.4a2.4 2.4 0 012.4 2.4v9.2a2.4 2.4 0 01-2.4 2.4H5.6a2.4 2.4 0 01-2.4-2.4V7.4z" />
      <path d="M17.6 9.55l3.05-1.83A1.15 1.15 0 0122.4 8.7v6.6a1.15 1.15 0 01-1.75.98L17.6 14.45V9.55z" />
    </svg>
  );
}

export function IconMore() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="6" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSettings() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function IconCompose() {
  return (
    <svg {...iconProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

export function IconAttach() {
  return (
    <svg {...iconProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconSend() {
  return (
    <svg {...iconProps}>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

export function IconMic() {
  return (
    <svg {...iconProps}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" />
    </svg>
  );
}
