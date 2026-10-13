"use client";

import React from 'react';
import styles from './alliance.module.css';

interface AllianceMapRoundBtnProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  title?: string;
  active?: boolean;
}

export default function AllianceMapRoundBtn({
  icon,
  label,
  onClick,
  href,
  disabled = false,
  title,
  active = false,
}: AllianceMapRoundBtnProps) {
  const className = `${styles.mapRoundBtn} ${active ? styles.mapRoundBtnActive : ''}`;
  const inner = (
    <>
      <span className={styles.mapRoundBtnIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.mapRoundBtnLabel}>{label}</span>
    </>
  );

  if (href && !disabled) {
    return (
      <a
        className={className}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={title ?? label}
        aria-label={label}
      >
        {inner}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
    >
      {inner}
    </button>
  );
}
