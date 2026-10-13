import React from 'react';

function TabSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
      {children}
    </svg>
  );
}

export function IconShopCards() {
  return (
    <TabSvg>
      <rect x="4.5" y="6.5" width="11" height="14" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M8.5 4.8h9.2A2.3 2.3 0 0120 7.1v11.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </TabSvg>
  );
}

export function IconShopShield() {
  return (
    <TabSvg>
      <path
        d="M12 3.4l7.2 2.4v6.3c0 4.55-3.05 7.7-7.2 8.9-4.15-1.2-7.2-4.35-7.2-8.9V5.8L12 3.4z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M12 8.2v7.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </TabSvg>
  );
}

export function IconShopFortress() {
  return (
    <TabSvg>
      <path
        d="M4.6 20.2V9.4l2.3-1.8V5.4h2.1v2.2h2v-2.2h2.1v2.2h2V5.4h2.1v2.2l2.3 1.8v10.8H4.6z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M10.2 20.2v-5.1h3.6v5.1" stroke="currentColor" strokeWidth="1.7" />
    </TabSvg>
  );
}

export function IconShopVip() {
  return (
    <TabSvg>
      <path
        d="M5.2 9.4L7.6 17h8.8l2.4-7.6-3.4 2.1L12 6.8 8.6 11.5 5.2 9.4z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </TabSvg>
  );
}
