"use client";

import React from 'react';

function normalizeHref(href: string): string {
  if (!href || href.startsWith('http') || href.startsWith('mailto:')) return href;
  if (href.includes('?')) {
    const [path, query] = href.split('?');
    const base = path === '/' ? '/' : path.endsWith('/') ? path : `${path}/`;
    return `${base}?${query}`;
  }
  return href === '/' ? '/' : href.endsWith('/') ? href : `${href}/`;
}

type AppLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

/** Static export + Capacitor üçün etibarlı səhifə keçidi */
export default function AppLink({ href, children, onClick, ...rest }: AppLinkProps) {
  const path = normalizeHref(href);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('mailto:') || path.startsWith('tel:')) {
      return;
    }
    e.preventDefault();
    window.location.href = path;
  };

  return (
    <a href={path} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
