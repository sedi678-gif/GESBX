/** Yeni oyunçu üçün ilkin balans — refresh zamanı süni doldurulmur */
export const DEFAULT_MANAT = 0;

/** Yalnız super admin ilk qurulumu */
export const ADMIN_START_MANAT = 1000;

const LEGACY_ADMIN_BALANCE = 999999;

export function normalizeManat(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value === LEGACY_ADMIN_BALANCE) return ADMIN_START_MANAT;
  return Math.floor(value);
}

/** Firebase sənədindən saxlanmış balans — yoxdursa null */
export function readStoredManat(data: Record<string, unknown> | null | undefined): number | null {
  if (!data) return null;
  const manat = typeof data.manat === 'number' ? data.manat : null;
  const coins = typeof data.coins === 'number' ? data.coins : null;
  if (manat != null && coins != null) return normalizeManat(Math.min(manat, coins));
  if (manat != null) return normalizeManat(manat);
  if (coins != null) return normalizeManat(coins);
  return null;
}

/** Cari balans — yoxdursa 0 */
export function resolvePlayerManat(data: Record<string, unknown> | null | undefined): number {
  return readStoredManat(data) ?? 0;
}

/** Firebase yazılışı — manat və coins həmişə eyni */
export function manatWritePatch(balance: number): { manat: number; coins: number } {
  const value = normalizeManat(balance);
  return { manat: value, coins: value };
}

export function formatManatPrice(amount: number): string {
  return `${amount.toLocaleString('az-AZ')} ₼`;
}

export function clearLegacyBalanceStorage() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('user_coins');
    localStorage.removeItem('yolustu_coins_cache_v1');
    localStorage.removeItem('yolustu_manat_cache_v1');
  } catch {
    /* ignore */
  }
}
