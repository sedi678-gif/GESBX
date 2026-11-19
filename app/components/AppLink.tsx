"use client";

import React from 'react';
import Link from 'next/link';

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

  const isExternal = path.startsWith('http://')
    || path.startsWith('https://')
    || path.startsWith('mailto:')
    || path.startsWith('tel:');

  if (isExternal) {
    return <a href={path} onClick={onClick} {...rest}>{children}</a>;
  }

  // Use Next.js client-side navigation instead of reloading the whole app
  // on every tab change. This keeps the Firebase session and shared state warm.
  return (
    <Link href={path} onClick={onClick} {...rest}>
      {children}
    </Link>
  );
}
