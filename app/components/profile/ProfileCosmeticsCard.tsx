"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { PlayerCosmetics } from '@/app/components/alliance/types';
import { COSMETIC_PRODUCTS, isVipActive, formatVipExpiry } from '@/app/components/shop/cosmeticsConfig';
import { equipCosmetic, unequipCosmeticSlot } from '@/app/components/shop/cosmeticsService';
import profileStyles from './profile.module.css';

interface ProfileCosmeticsCardProps {
  userId: string;
  cosmetics: PlayerCosmetics | undefined | null;
}

export default function ProfileCosmeticsCard({ userId, cosmetics }: ProfileCosmeticsCardProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const owned = cosmetics?.owned ?? [];
  const equipped = cosmetics?.equipped ?? {};
  const vipActive = isVipActive(cosmetics);

  const ownedProducts = COSMETIC_PRODUCTS.filter(
    (p) => p.category !== 'vip' && owned.includes(p.id)
  );

  const handleEquip = async (productId: string) => {
    setLoading(productId);
    try {
      await equipCosmetic(userId, productId);
    } finally {
      setLoading(null);
    }
  };

  const handleUnequip = async (slot: keyof PlayerCosmetics['equipped']) => {
    setLoading(`off_${slot}`);
    try {
      await unequipCosmeticSlot(userId, slot);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className={profileStyles.glassCard}>
      <div className={profileStyles.glassCardHeader}>👑 VIP & Kosmetika</div>
      <div className={profileStyles.glassCardBody}>
        {vipActive ? (
          <div className={profileStyles.vipStatusPill} style={{ marginBottom: 12 }}>
            {cosmetics!.vip.tier === 'platinum' ? '💎 Platinum VIP' : '👑 Gold VIP'} ·{' '}
            {formatVipExpiry(cosmetics!.vip.expiresAt)}
          </div>
        ) : (
          <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 12px' }}>
            VIP paketi al — rəngli ad, çərçivə və arxa fon aç.
          </p>
        )}

        {ownedProducts.length === 0 ? (
          <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
            Hələ kosmetika yoxdur.{' '}
            <Link href="/shop" style={{ color: '#f472b6', fontWeight: 800 }}>
              Mağazadan VIP al
            </Link>
          </p>
        ) : (
          <div className={profileStyles.cosmeticsGrid}>
            {ownedProducts.map((product) => {
              const slotKey =
                product.category === 'nameStyle'
                  ? 'nameStyleId'
                  : product.category === 'frame'
                    ? 'frameId'
                    : product.category === 'banner'
                      ? 'bannerId'
                      : 'badgeId';
              const isOn = equipped[slotKey as keyof typeof equipped] === product.id;

              return (
                <div
                  key={product.id}
                  className={`${profileStyles.cosmeticChip} ${profileStyles.cosmeticChipOwned} ${isOn ? profileStyles.cosmeticChipEquipped : ''}`}
                >
                  <span style={{ fontSize: 24 }}>{product.previewEmoji ?? '✨'}</span>
                  <span style={{ fontWeight: 800, textAlign: 'center' }}>{product.name}</span>
                  <button
                    type="button"
                    className={`${profileStyles.cosmeticEquipBtn} ${isOn ? profileStyles.cosmeticEquipBtnActive : ''}`}
                    disabled={!!loading}
                    onClick={() =>
                      isOn
                        ? handleUnequip(slotKey as keyof PlayerCosmetics['equipped'])
                        : handleEquip(product.id)
                    }
                  >
                    {loading === product.id || loading === `off_${slotKey}`
                      ? '...'
                      : isOn
                        ? 'Çıxart'
                        : 'Geyin'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <ul className={profileStyles.vipFeatureList} style={{ marginTop: 14 }}>
          <li>Rəngli ad stilləri profildə və söhbətdə görünür</li>
          <li>Çərçivə avatar halqasını dəyişir</li>
          <li>Arxa fon banneri profil üstünü bəzəyir</li>
          <li>Nişan adının yanında göstərilir</li>
        </ul>

        <Link href="/shop" className={profileStyles.shopBtn} style={{ marginTop: 12 }}>
          👑 VIP Mağazası
        </Link>
      </div>
    </div>
  );
}
