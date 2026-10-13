"use client";



import React from 'react';

import { PlayerCosmetics } from '@/app/components/alliance/types';

import {

  resolveBannerGradient,

  resolveFrameGradient,

  resolveNameStyleClass,

  resolveBadgeEmoji,

  isVipActive,

  DEFAULT_BANNER,

} from '@/app/components/shop/cosmeticsConfig';

import profileStyles from './profile.module.css';



interface ProfileHeroDisplayProps {

  name: string;

  surname?: string;

  avatar: string;

  handle?: string;

  metaExtra?: string;

  cosmetics?: PlayerCosmetics | null;

  bannerFallback?: string;

  bannerImage?: string;

  vipGlow?: boolean;

  editable?: boolean;

  uploadingAvatar?: boolean;

  uploadingBanner?: boolean;

  onEditAvatar?: () => void;

  onEditBanner?: () => void;

  bannerActions?: React.ReactNode;

  children?: React.ReactNode;

}



export default function ProfileHeroDisplay({

  name,

  surname,

  avatar,

  handle,

  metaExtra,

  cosmetics,

  bannerFallback = DEFAULT_BANNER,

  bannerImage,

  vipGlow = true,

  editable = false,

  uploadingAvatar = false,

  uploadingBanner = false,

  onEditAvatar,

  onEditBanner,

  bannerActions,

  children,

}: ProfileHeroDisplayProps) {

  const banner = resolveBannerGradient(cosmetics, bannerFallback);

  const frameGradient = resolveFrameGradient(cosmetics);

  const nameStyleKey = resolveNameStyleClass(cosmetics);

  const badge = resolveBadgeEmoji(cosmetics);

  const vipActive = isVipActive(cosmetics);



  const nameClass = [

    profileStyles.profileName,

    nameStyleKey ? profileStyles[nameStyleKey as keyof typeof profileStyles] : '',

  ]

    .filter(Boolean)

    .join(' ');



  const ringClass = [

    profileStyles.avatarRing,

    vipActive && vipGlow ? profileStyles.avatarRingVip : '',

    cosmetics?.equipped?.frameId && profileStyles.avatarRingEquipped,

  ]

    .filter(Boolean)

    .join(' ');



  const bannerStyle: React.CSSProperties = bannerImage

    ? {

        backgroundImage: `url(${bannerImage})`,

        backgroundSize: 'cover',

        backgroundPosition: 'center',

      }

    : { background: banner };



  return (

    <>

      <section className={profileStyles.heroSection}>

        <div

          className={`${profileStyles.heroBanner} ${vipActive ? profileStyles.heroBannerVip : ''} ${bannerImage ? profileStyles.heroBannerPhoto : ''}`}

          style={bannerStyle}

        >

          {(bannerActions || (editable && onEditBanner)) && (

            <div className={profileStyles.heroBannerTools}>

              {bannerActions}

              {editable && onEditBanner && (

                <button

                  type="button"

                  className={profileStyles.heroIconBtn}

                  onClick={onEditBanner}

                  disabled={uploadingBanner}

                  aria-label="Qapaq şəkli dəyiş"

                >

                  {uploadingBanner ? '…' : '✎'}

                </button>

              )}

            </div>

          )}

        </div>



        <div className={profileStyles.profileIdentity}>

          <div

            className={ringClass}

            style={frameGradient ? { background: frameGradient } : undefined}

          >

            <div className={profileStyles.avatarInner}>

              <img src={avatar} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

            </div>

            {editable && onEditAvatar && (

              <button

                type="button"

                className={profileStyles.avatarEditBtn}

                onClick={onEditAvatar}

                disabled={uploadingAvatar}

                aria-label="Profil şəkli dəyiş"

              >

                {uploadingAvatar ? '…' : '✎'}

              </button>

            )}

            {vipActive && <span className={profileStyles.vipRingPulse} aria-hidden="true" />}

          </div>



          <h1 className={nameClass}>

            {name} {surname}

            {badge && <span className={profileStyles.profileBadge}>{badge}</span>}

          </h1>



          {(handle || metaExtra) && (

            <p className={profileStyles.profileMeta}>

              {[handle, metaExtra].filter(Boolean).join(' · ')}

            </p>

          )}



          {vipActive && (

            <div className={profileStyles.vipStatusPill}>

              {cosmetics!.vip.tier === 'platinum' ? '💎 Platinum VIP' : '👑 Gold VIP'}

            </div>

          )}

        </div>

      </section>

      {children}

    </>

  );

}

