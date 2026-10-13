"use client";

interface ClickCardNotificationProps {
  visible: boolean;
  cardTitle: string;
}

export default function ClickCardNotification({ visible, cardTitle }: ClickCardNotificationProps) {
  if (!visible) return null;

  return (
    <div className="mx-3 mb-2 rounded-xl border border-amber-300/35 bg-slate-950/80 px-3 py-2">
      <p className="text-[10px] font-bold text-amber-100">Kliker görünüşü · {cardTitle}</p>
      <p className="mt-0.5 text-[9px] text-slate-400">Kartı oynayan Kliker deyil. Kliker yalnız çata göndərir.</p>
      <button
        type="button"
        className="mt-2 min-h-10 w-full rounded-lg bg-cyan-500 px-3 text-[12px] font-black text-slate-950"
      >
        İttifaq çatına göndər
      </button>
    </div>
  );
}
