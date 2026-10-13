"use client";

import type { ReactNode } from 'react';

interface BattleTableProps {
  children?: ReactNode;
}

export default function BattleTable({ children }: BattleTableProps) {
  return (
    <div className="relative mx-auto flex min-h-[168px] w-full max-w-[390px] flex-1 items-center justify-center px-3">
      <div className="relative h-full min-h-[168px] w-full rounded-[24px] p-[10px]">
        <div className="pointer-events-none absolute inset-0 rounded-[24px] border-[8px] border-[#8b6914] bg-[linear-gradient(145deg,#c4a35a,#8b6914_42%,#5c4308)]" />
        <div className="pointer-events-none absolute inset-[8px] rounded-[16px] border border-[#d4af37]/45" />
        <div
          className="relative flex h-full min-h-[148px] w-full flex-col items-center justify-center overflow-hidden rounded-[14px]"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(56,189,248,0.14), transparent 55%), linear-gradient(180deg, #12324a 0%, #0b1c2c 100%)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
