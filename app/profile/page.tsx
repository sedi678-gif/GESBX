"use client";

import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import AllianceProfileCard from '@/app/components/alliance/AllianceProfileCard';
import { useUser } from '@/context/UserContext';
import { useSettings } from '@/context/SettingsContext';
import { ensurePlayerProfile, reconcilePlayerIdentity } from '@/app/components/alliance/allianceService';
import { notifyUserIdChanged } from '@/app/lib/userId';
import {
  createPost,
  listenUserPosts,
  toggleLikePost,
  listenUserLikedPostIds,
  listenUserLikesReceived,
  ensureMinLikesReceived,
  readCachedLikesReceived,
  writeCachedLikesReceived,
  addPostComment,
  listenPostComments,
  preparePostMediaFile,
} from '@/app/lib/postsService';
import { ensureFirebaseAuth } from '@/app/lib/firebaseAuth';
import { PostComment, SocialPost } from '@/app/lib/socialTypes';
import { listenFollowCounts, reportContent } from '@/app/lib/socialService';
import AppBottomNav from '@/app/components/AppBottomNav';
import AdminPanel from '@/app/components/admin/AdminPanel';
import { isSuperAdmin } from '@/app/lib/adminConfig';
import { allocateNextUserId, allocateNextUserIdFallback } from '@/app/lib/adminService';
import {
  listenUserProfileMedia,
  updateProfileAvatar,
  updateProfileBanner,
} from '@/app/lib/profileMediaService';
import PostActionIcon from '@/app/components/social/PostActionIcon';
import OtherUserProfile from '@/app/components/social/OtherUserProfile';
import FollowListSheet from '@/app/components/social/FollowListSheet';
import AppLink from '@/app/components/AppLink';
import ProfileHeroDisplay from '@/app/components/profile/ProfileHeroDisplay';
import ProfilePhotoEditorModal from '@/app/components/profile/ProfilePhotoEditorModal';
import { ProfileCropKind } from '@/app/lib/profileImageCrop';
import socialStyles from '@/app/components/social/social.module.css';
import profileStyles from '@/app/components/profile/profile.module.css';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/firebase';
import { setProPanelActive } from '@/app/lib/userPlan';
import GoogleAdButton from '@/app/components/alliance/GoogleAdButton';
import {
  activateDiscoverBoost,
  isDiscoverBoostActive,
  listenUserDiscoverBoost,
} from '@/app/lib/discoverBoost';

interface GiftItem {
  id: number;
  name: string;
  icon: string;
  price: number;
}

interface PostItem {
  id: string;
  userId: string;
  title: string;
  mediaUrl: string;
  thumbnail: string;
  mediaType: 'video' | 'image';
  views: number;
  likes: number;
  isLiked: boolean;
  isSaved: boolean;
  receivedGifts: GiftItem[];
  createdAt: number;
}

interface Stats {
  followers: number;
  following: number;
  likes: number;
  activeSeasonScore: number;
}

const availableGifts: GiftItem[] = [
  { id: 1, name: "Qızılgül 🌹", icon: "🌹", price: 10 },
  { id: 2, name: "Ulduz ⭐", icon: "⭐", price: 25 },
  { id: 3, name: "Super Avtomobil 🏎️", icon: "🏎️", price: 100 },
  { id: 4, name: "Tac 👑", icon: "👑", price: 250 },
  { id: 5, name: "Almaz 💎", icon: "💎", price: 500 }
];

const translations = {
  az: {
    registerTitle: "Profil Yarat & Qeydiyyat",
    registerSubtitle: "Məlumatlarını doldur, şərtləri qəbul et və unikal ID qazan.",
    name: "Ad",
    surname: "Soyad",
    handle: "Nickname (İstifadəçi adı)",
    gender: "Cins",
    male: "Kişi",
    female: "Qadın",
    birthDate: "Doğum Tarixi",
    termsOpen: "İstifadəçi Razılaşmasını Tam Oxu 📜",
    termsClose: "İstifadəçi Razılaşmasını Bağla 🔼",
    termsTitle: "İstifadəçi Razılaşması və Məxfilik Qaydaları (Yolüstü - 2026):",
    termsText1: "1. Yaş Həddi: Yolüstü platformasından istifadə etmək üçün istifadəçilərin yaşı 13-dən aşağı olmamalıdır.",
    termsText2: "2. Valideyn Nəzarəti: 13 ilə 18 yaş arasında olan yeniyetmələr yalnız valideyn icazəsi ilə qoşula bilərlər.",
    termsText3: "3. İcma Davranış Qaydaları: Qarşılıqlı hörmət çərçivəsində ünsiyyət qurulmalıdır.",
    termsText4: "4. Təqib və Zorakılıq: Cyberbullying aşkarlanarsa hesab dərhal bloklanır.",
    termsText5: "5. Məzmun Filtrləri: Yetkinlik yaşına çatmayanlar üçün avtomatik məhdudiyyətlər.",
    termsText6: "6. Şəxsi Məlumatlar (GDPR): Məlumatlar şifrələnir və təhlükəsiz saxlanılır.",
    termsText7: "7. Unudulmaq Hüququ: Hesabın və məlumatların qalıcı olaraq silinməsi.",
    termsText8: "8. Hesabın Silinməsi: Tənzimləmələrdən birbaşa silmə imkanı.",
    termsText9: "9. Çərəzlər: Yalnız zəruri məlumatların toplanması.",
    termsText10: "10. Uşaqların Məxfiliyi: 13 yaşdan kiçiklərin məlumatları toplanılmır.",
    termsText11: "11. Əqli Mülkiyyət (DMCA): Müəllif hüquqlarını pozan məzmun bloklanır.",
    termsText12: "12. Satınalmalar: App Store və Google Play vasitəsilə həyata keçirilir.",
    termsText13: "13. Üçüncü Tərəf Xidmətləri: Bulud analitika və hostinq xidmətləri.",
    termsText14: "14. Şikayət Mexanizmi: Report və bloklama sistemi.",
    termsText15: "15. Məsuliyyət: Paylaşımlər 24 saat sonra avtomatik silinir.",
    termsText16: "16. Məsuliyyətin Məhdudlaşdırılması: Texniki fasilələrə görə məsuliyyət daşınmır.",
    termsAccept: "İstifadəçi razılaşmasını oxudum və bütün şərtləri qəbul edirəm.",
    submitBtn: "Qeydiyyatı Tamamla & Profil Yarat",
    wallet: "Cüzdan Balansı",
    newPost: "Yeni Paylaşım (24 saat)",
    hide: "🙈 Gizlə",
    show: "👁️ Göstər",
    followers: "İzləyici",
    following: "İzlənən",
    followersList: "İzləyicilər",
    followingList: "İzlənənlər",
    emptyFollowers: "Hələ izləyici yoxdur.",
    emptyFollowing: "Heç kimi izləmir.",
    gifts: "Hədiyyələr",
    likes: "Bəyənmə",
    allianceTitle: "İTTİFAQ (ALLIANCE)",
    noAllianceTitle: "Aktiv İttifaq yoxdur",
    noAllianceDesc: "Hələ heç bir ittifaqa qoşulmamısan",
    status: "STATUS",
    free: "Sərbəst",
    rating: "REYTİNQ",
    joinAlliance: "🛡️ İttifaqa Qoşul",
    rankTitle: "REYTİNQ VƏ NİŞAN",
    activeSeason: "Aktiv Sezon",
    score: "Xal",
    giftGallery: "Hədiyyələr Sərgisi",
    noGifts: "Hələ heç bir hədiyyə almamısan.",
    postsTitle: "Paylaşımlər (24 Saatlıq)",
    postsSubtitle: "Paylaşımlər 24 saat sonra avtomatik silinir.",
    total: "Cəmi",
    noPosts: "Aktiv paylaşımlarınız yoxdur",
    noPostsHint: "İlk paylaşımını etmək üçün '+' düyməsini istifadə et!"
  },
  ru: {
    registerTitle: "Создать профиль & Регистрация",
    registerSubtitle: "Заполните данные, примите условия.",
    name: "Имя",
    surname: "Фамилия",
    handle: "Никнейм",
    gender: "Пол",
    male: "Мужской",
    female: "Женский",
    birthDate: "Дата рождения",
    termsOpen: "Читать соглашение 📜",
    termsClose: "Закрыть соглашение 🔼",
    termsTitle: "Пользовательское соглашение (Yolüstü - 2026):",
    termsText1: "1. Возраст 13+.",
    termsText2: "2. Родительский контроль.",
    termsText3: "3. Правила поведения.",
    termsText4: "4. Борьба с буллингом.",
    termsText5: "5. Фильтры.",
    termsText6: "6. GDPR защита данных.",
    termsText7: "7. Право на забвение.",
    termsText8: "8. Удаление аккаунта.",
    termsText9: "9. Куки.",
    termsText10: "10. Конфиденциальность детей.",
    termsText11: "11. DMCA защита.",
    termsText12: "12. Покупки.",
    termsText13: "13. Сторонние сервисы.",
    termsText14: "14. Жалобы.",
    termsText15: "15. Посты на 24 часа.",
    termsText16: "16. Ограничение ответственности.",
    termsAccept: "Я принимаю условия.",
    submitBtn: "Завершить регистрацию",
    wallet: "Баланс",
    newPost: "Новый пост",
    hide: "🙈 Скрыть",
    show: "👁️ Показать",
    followers: "Подписчики",
    following: "Подписки",
    followersList: "Подписчики",
    followingList: "Подписки",
    emptyFollowers: "Пока нет подписчиков.",
    emptyFollowing: "Никого не отслеживает.",
    gifts: "Подарки",
    likes: "Лайки",
    allianceTitle: "АЛЬЯНС",
    noAllianceTitle: "Нет альянса",
    noAllianceDesc: "Вы не состоите в альянсе",
    status: "СТАТУС",
    free: "Свободный",
    rating: "РЕЙТИНГ",
    joinAlliance: "🛡️ Вступить",
    rankTitle: "РЕЙТИНГ",
    activeSeason: "Сезон",
    score: "Очки",
    giftGallery: "Галерея подарков",
    noGifts: "Нет подарков",
    postsTitle: "Публикации",
    postsSubtitle: "Удаляются через 24 часа",
    total: "Всего",
    noPosts: "Активных публикаций нет",
    noPostsHint: "Нажми «+», чтобы сделать первую публикацию!"
  },
  en: {
    registerTitle: "Create Profile & Register",
    registerSubtitle: "Fill in your details.",
    name: "First Name",
    surname: "Last Name",
    handle: "Username",
    gender: "Gender",
    male: "Male",
    female: "Female",
    birthDate: "Birth Date",
    termsOpen: "Read Agreement 📜",
    termsClose: "Close Agreement 🔼",
    termsTitle: "User Agreement (Yolüstü - 2026):",
    termsText1: "1. Age limit 13+.",
    termsText2: "2. Parental control.",
    termsText3: "3. Community guidelines.",
    termsText4: "4. Anti-harassment.",
    termsText5: "5. Content filters.",
    termsText6: "6. GDPR data protection.",
    termsText7: "7. Right to be forgotten.",
    termsText8: "8. Account deletion.",
    termsText9: "9. Cookies.",
    termsText10: "10. Child privacy.",
    termsText11: "11. DMCA.",
    termsText12: "12. Purchases.",
    termsText13: "13. Third-party services.",
    termsText14: "14. Reporting.",
    termsText15: "15. 24h posts.",
    termsText16: "16. Limitation of liability.",
    termsAccept: "I accept the terms.",
    submitBtn: "Complete Registration",
    wallet: "Wallet Balance",
    newPost: "New Post",
    hide: "🙈 Hide",
    show: "👁️ Show",
    followers: "Followers",
    following: "Following",
    followersList: "Followers",
    followingList: "Following",
    emptyFollowers: "No followers yet.",
    emptyFollowing: "Not following anyone yet.",
    gifts: "Gifts",
    likes: "Likes",
    allianceTitle: "ALLIANCE",
    noAllianceTitle: "No Alliance",
    noAllianceDesc: "No active alliance",
    status: "STATUS",
    free: "Free",
    rating: "RATING",
    joinAlliance: "🛡️ Join Alliance",
    rankTitle: "RATING",
    activeSeason: "Season",
    score: "Score",
    giftGallery: "Gift Gallery",
    noGifts: "No gifts",
    postsTitle: "Posts",
    postsSubtitle: "Deleted after 24 hours",
    total: "Total",
    noPosts: "You have no active posts",
    noPostsHint: "Tap + to share your first post!"
  },
  tr: {
    registerTitle: "Profil Oluştur & Kayıt",
    registerSubtitle: "Bilgilerini doldur, şartları kabul et.",
    name: "Ad",
    surname: "Soyad",
    handle: "Kullanıcı adı",
    gender: "Cinsiyet",
    male: "Erkek",
    female: "Kadın",
    birthDate: "Doğum tarihi",
    termsOpen: "Kullanıcı sözleşmesini oku 📜",
    termsClose: "Sözleşmeyi kapat 🔼",
    termsTitle: "Kullanıcı sözleşmesi (Yolüstü - 2026):",
    termsText1: "1. Yaş sınırı 13+.",
    termsText2: "2. Ebeveyn kontrolü.",
    termsText3: "3. Topluluk kuralları.",
    termsText4: "4. Taciz yasağı.",
    termsText5: "5. İçerik filtreleri.",
    termsText6: "6. GDPR veri koruması.",
    termsText7: "7. Unutulma hakkı.",
    termsText8: "8. Hesap silme.",
    termsText9: "9. Çerezler.",
    termsText10: "10. Çocuk gizliliği.",
    termsText11: "11. DMCA.",
    termsText12: "12. Satın almalar.",
    termsText13: "13. Üçüncü taraf hizmetler.",
    termsText14: "14. Şikayet.",
    termsText15: "15. 24 saatlik paylaşımlar.",
    termsText16: "16. Sorumluluk sınırı.",
    termsAccept: "Şartları okudum ve kabul ediyorum.",
    submitBtn: "Kaydı tamamla ve profil oluştur",
    wallet: "Cüzdan bakiyesi",
    newPost: "Yeni paylaşım",
    hide: "🙈 Gizle",
    show: "👁️ Göster",
    followers: "Takipçi",
    following: "Takip",
    followersList: "Takipçiler",
    followingList: "Takip edilenler",
    emptyFollowers: "Henüz takipçi yok.",
    emptyFollowing: "Kimseyi takip etmiyor.",
    gifts: "Hediyeler",
    likes: "Beğeni",
    allianceTitle: "İTTİFAK",
    noAllianceTitle: "Aktif ittifak yok",
    noAllianceDesc: "Henüz bir ittifaka katılmadın",
    status: "DURUM",
    free: "Serbest",
    rating: "SIRALAMA",
    joinAlliance: "🛡️ İttifaka katıl",
    rankTitle: "SIRALAMA VE ROZET",
    activeSeason: "Aktif sezon",
    score: "Puan",
    giftGallery: "Hediye galerisi",
    noGifts: "Henüz hediye yok.",
    postsTitle: "Paylaşımlar (24 saat)",
    postsSubtitle: "Paylaşımlar 24 saat sonra silinir.",
    total: "Toplam",
    noPosts: "Aktif paylaşımın yok",
    noPostsHint: "İlk paylaşım için + düğmesini kullan!"
  }
};

const DEFAULT_PROFILE_USER = {
  id: '',
  name: '',
  surname: '',
  handle: '',
  gender: 'Kişi',
  birthDate: '',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
  bannerImage: '',
  bannerGradient: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 45%, #06b6d4 100%)',
  bio: 'Yeni başlanğıc 🚀',
  allianceName: '',
};

function readStoredProfile() {
  if (typeof window === 'undefined') return null;
  try {
    const savedUser = localStorage.getItem('app_current_user_v6');
    if (!savedUser) return null;
    const parsed = JSON.parse(savedUser);
    const savedAlliance = localStorage.getItem('app_user_alliance_name') || '';
    return { ...parsed, allianceName: savedAlliance || parsed.allianceName || '' };
  } catch {
    return null;
  }
}

function ProfileBootSkeleton() {
  return (
    <div className={profileStyles.bootSkeleton}>
      <div className={profileStyles.bootPulse} />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileBootSkeleton />}>
      <ProfilePageContent />
    </Suspense>
  );
}

function ProfilePageContent() {
  const searchParams = useSearchParams();
  const viewUserId = searchParams.get('user');

  const { manat, playerProfile, spendManat, userId } = useUser();
  const { language: settingsLang, setLanguage: setSettingsLang } = useSettings();
  const language = settingsLang;
  const t = translations[language] ?? translations.az;
  const [stats, setStats] = useState<Stats>({ followers: 0, following: 0, likes: 0, activeSeasonScore: 0 });
  const [followListMode, setFollowListMode] = useState<'followers' | 'following' | null>(null);

  const [currentUser, setCurrentUser] = useState(DEFAULT_PROFILE_USER);
  const [isRegistered, setIsRegistered] = useState(false);
  const [profileBooting, setProfileBooting] = useState(true);
  const [inputName, setInputName] = useState('');
  const [inputSurname, setInputSurname] = useState('');
  const [inputHandle, setInputHandle] = useState('');
  const [inputGender, setInputGender] = useState('Kişi');
  const [inputBirthDate, setInputBirthDate] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [photoEditor, setPhotoEditor] = useState<{ kind: ProfileCropKind; file: File } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const mediaSyncPausedRef = useRef(false);

  useEffect(() => {
    const stored = readStoredProfile();
    if (stored) {
      setCurrentUser(stored);
      setIsRegistered(true);
      localStorage.setItem('app_current_user_v6', JSON.stringify(stored));
      notifyUserIdChanged();
    } else {
      const savedAlliance = localStorage.getItem('app_user_alliance_name') || '';
      if (savedAlliance) {
        setCurrentUser((prev) => ({ ...prev, allianceName: savedAlliance }));
      }
    }
    setProfileBooting(false);
  }, []);

  useEffect(() => {
    if (isRegistered) void ensureFirebaseAuth();
  }, [isRegistered]);

  useEffect(() => {
    if (!currentUser.id || !isRegistered) return;
    return listenFollowCounts(currentUser.id, (followers, following) => {
      setStats((prev) => ({ ...prev, followers, following }));
    });
  }, [currentUser.id, isRegistered]);

  useEffect(() => {
    if (!currentUser.id || !isRegistered) return;
    const cached = readCachedLikesReceived(currentUser.id);
    if (cached > 0) {
      setStats((prev) => ({ ...prev, likes: Math.max(prev.likes, cached) }));
    }
    return listenUserLikesReceived(currentUser.id, (likes) => {
      writeCachedLikesReceived(currentUser.id, likes);
      setStats((prev) => ({ ...prev, likes: Math.max(prev.likes, likes) }));
    });
  }, [currentUser.id, isRegistered]);

  useEffect(() => {
    if (!currentUser.id || !isRegistered) return;
    return listenUserProfileMedia(
      currentUser.id,
      (media) => {
        setCurrentUser((prev) => {
          const next = {
            ...prev,
            ...(media.avatar ? { avatar: media.avatar } : {}),
            ...(media.bannerImage !== undefined ? { bannerImage: media.bannerImage || '' } : {}),
            ...(media.bannerGradient ? { bannerGradient: media.bannerGradient } : {}),
          };
          localStorage.setItem('app_current_user_v6', JSON.stringify(next));
          return next;
        });
      },
      { paused: () => mediaSyncPausedRef.current }
    );
  }, [currentUser.id, isRegistered]);

  const persistProfile = (patch: Partial<typeof currentUser>) => {
    setCurrentUser((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem('app_current_user_v6', JSON.stringify(next));
      return next;
    });
  };

  const openPhotoEditor = (kind: ProfileCropKind, file: File) => {
    setPhotoEditor({ kind, file });
  };

  const closePhotoEditor = () => {
    setPhotoEditor(null);
  };

  const uploadProfilePhoto = async (kind: ProfileCropKind, file: File) => {
    if (!currentUser.id) return;

    const isAvatar = kind === 'avatar';
    const previous = isAvatar ? currentUser.avatar : currentUser.bannerImage;
    const preview = URL.createObjectURL(file);
    if (isAvatar) {
      persistProfile({ avatar: preview });
      setUploadingAvatar(true);
    } else {
      persistProfile({ bannerImage: preview });
      setUploadingBanner(true);
    }
    mediaSyncPausedRef.current = true;

    try {
      void ensureFirebaseAuth();
      const url = isAvatar
        ? await updateProfileAvatar(currentUser.id, file)
        : await updateProfileBanner(currentUser.id, file);
      if (isAvatar) {
        persistProfile({ avatar: url });
      } else {
        persistProfile({ bannerImage: url });
      }
      closePhotoEditor();
    } catch (err) {
      if (isAvatar) {
        persistProfile({ avatar: previous });
      } else {
        persistProfile({ bannerImage: previous });
      }
      console.error(err);
      alert(err instanceof Error ? err.message : isAvatar ? 'Profil şəkli saxlanmadı.' : 'Qapaq şəkli saxlanmadı.');
    } finally {
      URL.revokeObjectURL(preview);
      if (isAvatar) setUploadingAvatar(false);
      else setUploadingBanner(false);
      window.setTimeout(() => {
        mediaSyncPausedRef.current = false;
      }, 2000);
    }
  };

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentUser.id) return;
    if (!file.type.startsWith('image/')) {
      alert('Yalnız şəkil faylı seçin.');
      return;
    }
    openPhotoEditor('avatar', file);
  };

  const handleBannerFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentUser.id) return;
    if (!file.type.startsWith('image/')) {
      alert('Yalnız şəkil faylı seçin.');
      return;
    }
    openPhotoEditor('banner', file);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim() || !inputSurname.trim() || !inputBirthDate) return;

    if (!acceptedTerms) {
      alert("Zəhmət olmasa İstifadəçi Razılaşmasını qəbul edin.");
      return;
    }

    try {
      const generatedId = await allocateNextUserId();
      const formattedHandle = inputHandle.trim() ? (inputHandle.startsWith('@') ? inputHandle : `@${inputHandle}`) : `@${inputName.toLowerCase().replace(/\s+/g, '')}`;
      const savedAlliance = localStorage.getItem('app_user_alliance_name') || '';

      const newUser = {
        id: generatedId,
        name: inputName,
        surname: inputSurname,
        handle: formattedHandle,
        gender: inputGender,
        birthDate: inputBirthDate,
        role: 'user',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
        bannerImage: '',
        bannerGradient: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 50%, #3b82f6 100%)',
        bio: 'Yeni başlanğıc 🚀',
        allianceName: savedAlliance,
        createdAt: Date.now(),
        likesReceived: 0,
      };

      await setDoc(doc(db, "users", generatedId), newUser);
      const fbUid = auth.currentUser?.uid ?? null;
      if (fbUid && fbUid !== generatedId) {
        await reconcilePlayerIdentity(generatedId, fbUid, `${inputName} ${inputSurname}`.trim());
      } else {
        await ensurePlayerProfile(generatedId, `${inputName} ${inputSurname}`.trim(), fbUid);
      }

      localStorage.setItem('app_current_user_v6', JSON.stringify(newUser));
      const idNum = parseInt(generatedId, 10);
      if (!Number.isNaN(idNum)) {
        const prev = parseInt(localStorage.getItem('app_last_id_num_v6') || '1', 10);
        localStorage.setItem('app_last_id_num_v6', String(Math.max(prev, idNum)));
      }
      setCurrentUser(newUser);
      setIsRegistered(true);
      notifyUserIdChanged();
    } catch (error) {
      console.error("Firebase ID xətası, lokal rejimə keçid edilir:", error);
      const generatedId = await allocateNextUserIdFallback();
      const formattedHandle = inputHandle.trim() ? (inputHandle.startsWith('@') ? inputHandle : `@${inputHandle}`) : `@${inputName.toLowerCase().replace(/\s+/g, '')}`;
      const savedAlliance = localStorage.getItem('app_user_alliance_name') || '';

      const newUser = {
        id: generatedId,
        name: inputName,
        surname: inputSurname,
        handle: formattedHandle,
        gender: inputGender,
        birthDate: inputBirthDate,
        role: 'user',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
        bannerImage: '',
        bannerGradient: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 50%, #3b82f6 100%)',
        bio: 'Yeni başlanğıc 🚀',
        allianceName: savedAlliance,
        createdAt: Date.now(),
        likesReceived: 0,
      };

      localStorage.setItem('app_current_user_v6', JSON.stringify(newUser));
      const fbUid = auth.currentUser?.uid ?? null;
      if (fbUid && fbUid !== generatedId) {
        await reconcilePlayerIdentity(generatedId, fbUid, `${inputName} ${inputSurname}`.trim());
      } else {
        await ensurePlayerProfile(generatedId, `${inputName} ${inputSurname}`.trim(), fbUid);
      }
      setCurrentUser(newUser);
      setIsRegistered(true);
      notifyUserIdChanged();
    }
  };

  const [isBalanceVisible, setIsBalanceVisible] = useState<boolean>(true);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [showAllianceModal, setShowAllianceModal] = useState(false);
  const [showRankModal, setShowRankModal] = useState(false);
  const [showGiftsModal, setShowGiftsModal] = useState(false);
  const [socialNotice, setSocialNotice] = useState<string | null>(null);
  const [socialToggling, setSocialToggling] = useState(false);
  const [socialOn, setSocialOn] = useState(false);
  const [discoverBoostUntil, setDiscoverBoostUntil] = useState(0);
  const [boostNow, setBoostNow] = useState(() => Date.now());
  const [showWalletModal, setShowWalletModal] = useState(false);

  useEffect(() => {
    if (!currentUser.id) return;
    return listenUserDiscoverBoost(currentUser.id, setDiscoverBoostUntil);
  }, [currentUser.id]);

  useEffect(() => {
    if (!isDiscoverBoostActive(discoverBoostUntil)) return;
    const timer = window.setInterval(() => setBoostNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [discoverBoostUntil]);

  useEffect(() => {
    if (!socialNotice) return;
    const timer = window.setTimeout(() => setSocialNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [socialNotice]);

  useEffect(() => {
    setSocialOn(playerProfile?.proPanelActive === true);
  }, [playerProfile?.proPanelActive]);
  const [newCommentText, setNewCommentText] = useState('');
  const [viewerComments, setViewerComments] = useState<PostComment[]>([]);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostType, setNewPostType] = useState<'video' | 'image'>('image');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadReadyFile, setUploadReadyFile] = useState<File | null>(null);
  const [isPreparingFile, setIsPreparingFile] = useState(false);
  const [filePreviewUrl, setFilePreviewUrl] = useState('');

  const postGalleryInputRef = useRef<HTMLInputElement>(null);
  const postCameraInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPost, setIsUploadingPost] = useState(false);
  const [postsLoadError, setPostsLoadError] = useState('');
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const likedPostIdsRef = useRef(likedPostIds);
  likedPostIdsRef.current = likedPostIds;

  useEffect(() => {
    if (!currentUser.id || !isRegistered) return;
    return listenUserLikedPostIds(currentUser.id, setLikedPostIds);
  }, [currentUser.id, isRegistered]);

  useEffect(() => {
    if (!currentUser.id || !isRegistered) return;
    setPosts((prev) =>
      prev.map((p) => ({ ...p, isLiked: likedPostIds.has(p.id) }))
    );
  }, [likedPostIds, currentUser.id, isRegistered]);

  useEffect(() => {
    if (!currentUser.id || !isRegistered) return;
    setPostsLoadError('');
    return listenUserPosts(
      currentUser.id,
      (firebasePosts: SocialPost[]) => {
        setPosts(firebasePosts.map((p) => ({
          id: p.id,
          userId: p.userId,
          title: p.title,
          mediaUrl: p.mediaUrl,
          thumbnail: p.mediaUrl,
          mediaType: p.mediaType,
          views: 0,
          likes: p.likes,
          isLiked: likedPostIdsRef.current.has(p.id),
          isSaved: false,
          receivedGifts: [],
          createdAt: p.createdAt,
        })));
      },
      setPostsLoadError
    );
  }, [currentUser.id, isRegistered]);

  useEffect(() => {
    if (!currentUser.id || !isRegistered) return;
    const live = posts.reduce((sum, post) => sum + (Number(post.likes) || 0), 0);
    if (live <= 0) return;
    setStats((prev) => (live > prev.likes ? { ...prev, likes: live } : prev));
    const stored = readCachedLikesReceived(currentUser.id);
    if (live > stored) {
      writeCachedLikesReceived(currentUser.id, live);
      void ensureMinLikesReceived(currentUser.id, live);
    }
  }, [posts, currentUser.id, isRegistered]);

  const closePostViewer = () => setSelectedPostId(null);

  useEffect(() => {
    if (!selectedPostId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePostViewer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedPostId]);

  useEffect(() => {
    if (!selectedPostId) {
      setViewerComments([]);
      setNewCommentText('');
      return;
    }
    return listenPostComments(selectedPostId, setViewerComments);
  }, [selectedPostId]);

  const activePost = posts.find(p => p.id === selectedPostId);
  const allReceivedGifts = posts.flatMap(p => p.receivedGifts);

  const handleLike = async (id: string) => {
    const post = posts.find((p) => p.id === id);
    if (!post) return;
    if (post.isLiked || likedPostIds.has(id)) {
      alert('Bu paylaşımı artıq bəyənmisiniz.');
      return;
    }
    try {
      const result = await toggleLikePost(id, currentUser.id);
      setLikedPostIds((prev) => new Set(prev).add(id));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, isLiked: true, likes: result.likes } : p
        )
      );
      if (!result.alreadyLiked) {
        setStats((prev) => {
          const nextLikes = prev.likes + 1;
          writeCachedLikesReceived(currentUser.id, nextLikes);
          return { ...prev, likes: nextLikes };
        });
      }
    } catch (err) {
      console.error(err);
      alert('Bəyənmə qeydə alınmadı.');
    }
  };

  const handleSharePost = async (postId: string, title: string) => {
    const url = `${window.location.origin}/profile?user=${currentUser.id}`;
    const text = `${currentUser.name} — ${title}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: text, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      alert('Paylaşım linki kopyalandı.');
    } catch {
      /* ləğv */
    }
  };

  const handleSave = (id: string) => {
    setPosts(prev => prev.map(p => {
      if (p.id === id) {
        const newIsSaved = !p.isSaved;
        alert(newIsSaved ? 'Paylaşım yaddaşa saxlandı! 💾' : 'Paylaşım yaddaşdan çıxarıldı.');
        return { ...p, isSaved: newIsSaved };
      }
      return p;
    }));
  };

  const handleReport = async () => {
    if (!activePost) return;
    const reason = prompt('Şikayət səbəbini qeyd edin:');
    if (!reason?.trim()) return;
    try {
      await reportContent({
        reporterId: currentUser.id,
        targetUserId: activePost.userId,
        targetPostId: activePost.id,
        reason: reason.trim(),
        type: 'post',
      });
      alert('Şikayətiniz admin panelə göndərildi.');
    } catch (err) {
      console.error(err);
      alert('Şikayət göndərilmədi. Yenidən cəhd edin.');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || selectedPostId === null || commentSubmitting) return;

    setCommentSubmitting(true);
    try {
      await addPostComment(
        selectedPostId,
        {
          id: currentUser.id,
          name: `${currentUser.name || 'Sən'} ${currentUser.surname || ''}`.trim(),
          avatar: currentUser.avatar,
        },
        newCommentText.trim()
      );
      setNewCommentText('');
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Şərh göndərilmədi.');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleSendGift = async (gift: GiftItem) => {
    if (manat < gift.price) {
      alert("Balansınızda kifayət qədər manat yoxdur! ₼");
      return;
    }

    const ok = await spendManat(gift.price);
    if (!ok) {
      alert("Balansınızda kifayət qədər manat yoxdur! ₼");
      return;
    }

    setPosts(prev => prev.map(p => {
      if (p.id === selectedPostId) {
        return {
          ...p,
          receivedGifts: [gift, ...p.receivedGifts]
        };
      }
      return p;
    }));

    setIsGiftModalOpen(false);
    alert(`Uğurla ${gift.name} hədiyyəsi göndərildi! 🎉`);
  };

  const handleOpenUploadModal = () => {
    setNewPostTitle('');
    setSelectedFile(null);
    setUploadReadyFile(null);
    setIsPreparingFile(false);
    setFilePreviewUrl('');
    setIsUploadModalOpen(true);
    void ensureFirebaseAuth();
  };

  const handlePostFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.type.startsWith('video/') && file.size > 25 * 1024 * 1024) {
      alert('Video çox böyükdür (maks. 25 MB).');
      return;
    }
    if (file.type.startsWith('image/') && file.size > 8 * 1024 * 1024) {
      alert('Şəkil çox böyükdür (maks. 8 MB).');
      return;
    }

    setSelectedFile(file);
    setUploadReadyFile(file.type.startsWith('video/') ? file : null);
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    const fileUrl = URL.createObjectURL(file);
    setFilePreviewUrl(fileUrl);
    setNewPostType(file.type.startsWith('video/') ? 'video' : 'image');

    if (file.type.startsWith('image/')) {
      setIsPreparingFile(true);
      void preparePostMediaFile(file)
        .then((prepared) => setUploadReadyFile(prepared))
        .catch(() => setUploadReadyFile(file))
        .finally(() => setIsPreparingFile(false));
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRegistered || !currentUser.id) {
      alert('Paylaşım üçün əvvəlcə profil qeydiyyatını tamamlayın.');
      return;
    }
    if (!newPostTitle.trim() || !selectedFile) {
      alert("Zəhmət olmasa başlıq daxil edin və fayl seçin.");
      return;
    }
    if (isPreparingFile) {
      alert('Fayl hazırlanır, bir neçə saniyə gözləyin.');
      return;
    }
    if (isUploadingPost) return;

    const fileToUpload = uploadReadyFile ?? selectedFile;

    setIsUploadingPost(true);
    try {
      await createPost(
        {
          id: currentUser.id,
          name: currentUser.name,
          surname: currentUser.surname,
          handle: currentUser.handle,
          gender: currentUser.gender,
          birthDate: currentUser.birthDate,
          avatar: currentUser.avatar,
          region: (currentUser as { region?: string }).region,
        },
        newPostTitle.trim(),
        fileToUpload,
        newPostType
      );

      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
      setNewPostTitle('');
      setSelectedFile(null);
      setUploadReadyFile(null);
      setFilePreviewUrl('');
      setIsUploadModalOpen(false);
      alert('Paylaşım uğurla yerləşdirildi! Kəşf et səhifəsində hamı görə bilər (24 saat).');
    } catch (err) {
      console.error('Paylaşım xətası:', err);
      const msg = err instanceof Error ? err.message : 'Paylaşım yüklənmədi.';
      alert(msg);
    } finally {
      setIsUploadingPost(false);
    }
  };

  if (profileBooting) {
    return <ProfileBootSkeleton />;
  }

  if (!isRegistered) {
    return (
      <div className={profileStyles.registerWorld}>
        <div className={profileStyles.registerCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h2 className={profileStyles.registerTitle}>{t.registerTitle}</h2>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button type="button" onClick={() => setSettingsLang('az')} style={{ ...langBtnStyle, fontWeight: language === 'az' ? 800 : 400, backgroundColor: language === 'az' ? 'rgba(236,72,153,0.3)' : 'rgba(30,41,59,0.8)', color: '#e2e8f0' }}>AZ</button>
              <button type="button" onClick={() => setSettingsLang('ru')} style={{ ...langBtnStyle, fontWeight: language === 'ru' ? 800 : 400, backgroundColor: language === 'ru' ? 'rgba(236,72,153,0.3)' : 'rgba(30,41,59,0.8)', color: '#e2e8f0' }}>RU</button>
              <button type="button" onClick={() => setSettingsLang('en')} style={{ ...langBtnStyle, fontWeight: language === 'en' ? 800 : 400, backgroundColor: language === 'en' ? 'rgba(236,72,153,0.3)' : 'rgba(30,41,59,0.8)', color: '#e2e8f0' }}>EN</button>
              <button type="button" onClick={() => setSettingsLang('tr')} style={{ ...langBtnStyle, fontWeight: language === 'tr' ? 800 : 400, backgroundColor: language === 'tr' ? 'rgba(236,72,153,0.3)' : 'rgba(30,41,59,0.8)', color: '#e2e8f0' }}>TR</button>
            </div>
          </div>
          <p className={profileStyles.registerSub}>{t.registerSubtitle}</p>

          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label className={profileStyles.registerLabel}>{t.name}</label>
              <input type="text" placeholder="Məs: Sədi" value={inputName} onChange={(e) => setInputName(e.target.value)} className={profileStyles.registerInput} required />
            </div>
            <div>
              <label className={profileStyles.registerLabel}>{t.surname}</label>
              <input type="text" placeholder="Məs: Məmmədov" value={inputSurname} onChange={(e) => setInputSurname(e.target.value)} className={profileStyles.registerInput} required />
            </div>
            <div>
              <label className={profileStyles.registerLabel}>{t.handle}</label>
              <input type="text" placeholder="Məs: @sadi" value={inputHandle} onChange={(e) => setInputHandle(e.target.value)} className={profileStyles.registerInput} />
            </div>
            <div>
              <label className={profileStyles.registerLabel}>{t.gender}</label>
              <select value={inputGender} onChange={(e) => setInputGender(e.target.value)} className={profileStyles.registerInput}>
                <option value="Kişi">{t.male}</option>
                <option value="Qadın">{t.female}</option>
              </select>
            </div>
            <div>
              <label className={profileStyles.registerLabel}>{t.birthDate}</label>
              <input type="date" value={inputBirthDate} onChange={(e) => setInputBirthDate(e.target.value)} className={profileStyles.registerInput} required />
            </div>

            <div style={{ marginTop: '4px' }}>
              <button type="button" onClick={() => setIsTermsOpen(!isTermsOpen)} style={{ background: 'none', border: 'none', color: '#f472b6', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                {isTermsOpen ? t.termsClose : t.termsOpen}
              </button>
              {isTermsOpen && (
                <div style={{ backgroundColor: 'rgba(30,41,59,0.6)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(148,163,184,0.2)', fontSize: '11px', color: '#cbd5e1', maxHeight: '180px', overflowY: 'auto', marginTop: '6px', lineHeight: '1.5' }}>
                  <strong style={{ display: 'block', marginBottom: '8px', color: '#f1f5f9' }}>{t.termsTitle}</strong>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <p style={{ margin: 0 }}>{t.termsText1}</p>
                    <p style={{ margin: 0 }}>{t.termsText2}</p>
                    <p style={{ margin: 0 }}>{t.termsText3}</p>
                    <p style={{ margin: 0 }}>{t.termsText4}</p>
                    <p style={{ margin: 0 }}>{t.termsText5}</p>
                    <p style={{ margin: 0 }}>{t.termsText6}</p>
                    <p style={{ margin: 0 }}>{t.termsText7}</p>
                    <p style={{ margin: 0 }}>{t.termsText8}</p>
                    <p style={{ margin: 0 }}>{t.termsText9}</p>
                    <p style={{ margin: 0 }}>{t.termsText10}</p>
                    <p style={{ margin: 0 }}>{t.termsText11}</p>
                    <p style={{ margin: 0 }}>{t.termsText12}</p>
                    <p style={{ margin: 0 }}>{t.termsText13}</p>
                    <p style={{ margin: 0 }}>{t.termsText14}</p>
                    <p style={{ margin: 0 }}>{t.termsText15}</p>
                    <p style={{ margin: 0 }}>{t.termsText16}</p>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <input type="checkbox" id="terms" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} required />
              <label htmlFor="terms" style={{ fontSize: '11px', fontWeight: 600, color: '#e2e8f0', cursor: 'pointer' }}>{t.termsAccept}</label>
            </div>

            <button type="submit" className={profileStyles.registerSubmit}>{t.submitBtn}</button>
          </form>
        </div>
      </div>
    );
  }

  if (viewUserId && viewUserId !== currentUser.id) {
    return <OtherUserProfile targetUserId={viewUserId} myId={userId} />;
  }

  return (
    <div className={profileStyles.profileWorld}>
      <div className={profileStyles.profileGlow} aria-hidden />
      <header className={profileStyles.profileTopBar}>
        <div className={profileStyles.profileTopLeft}>
          <div className={profileStyles.profileAdBoltWrap}>
            <GoogleAdButton
              variant="bolt"
              className={isDiscoverBoostActive(discoverBoostUntil, boostNow) ? profileStyles.profileAdBoltOn : undefined}
              onReward={async () => {
                try {
                  await activateDiscoverBoost(currentUser.id);
                  setSocialNotice('Videoların və şəkillərin 2 dəqiqə kəşfdə öndədir');
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Kəşf boostu alınmadı');
                }
              }}
            />
            {isDiscoverBoostActive(discoverBoostUntil, boostNow) ? (
              <span className={profileStyles.profileAdBoltTimer}>
                {Math.ceil((discoverBoostUntil - boostNow) / 1000)}s
              </span>
            ) : null}
          </div>
          <div>
            <p className={profileStyles.profileEyebrow}>Hesabım</p>
            <h1 className={profileStyles.profileTopTitle}>Profil</h1>
          </div>
        </div>
        <div className={profileStyles.profileTopActions}>
          <AppLink href="/shop" className={profileStyles.shopLinkBtn}>
            Mağaza
          </AppLink>
          <button
            type="button"
            className={profileStyles.walletPill}
            onClick={() => setShowWalletModal(true)}
            title={t.wallet}
          >
            ₼ {isBalanceVisible ? manat.toLocaleString('az-AZ') : '•••'}
          </button>
          <AppLink href="/settings" className={profileStyles.settingsBtn} title="Ayarlar">
            ⚙️
          </AppLink>
        </div>
      </header>

      <ProfileHeroDisplay
        name={currentUser.name}
        surname={currentUser.surname}
        avatar={currentUser.avatar}
        handle={currentUser.handle}
        metaExtra={`${currentUser.gender} · ID ${currentUser.id}`}
        cosmetics={playerProfile?.cosmetics}
        bannerFallback={currentUser.bannerGradient}
        bannerImage={currentUser.bannerImage || undefined}
        editable={isRegistered}
        uploadingAvatar={uploadingAvatar}
        uploadingBanner={uploadingBanner}
        onEditAvatar={() => avatarInputRef.current?.click()}
        onEditBanner={() => bannerInputRef.current?.click()}
        bannerActions={
          <div className={profileStyles.socialModeControl}>
            <button
              type="button"
              className={`${profileStyles.socialModeBtn} ${socialOn ? profileStyles.socialModeBtnOn : profileStyles.socialModeBtnOff}`}
              aria-pressed={socialOn}
              disabled={socialToggling || !userId}
              aria-label={socialOn ? 'Sosial rejim açıq' : 'Sosial rejim bağlı'}
              onClick={() => {
                if (!userId || socialToggling) return;
                const next = !socialOn;
                setSocialOn(next);
                setSocialToggling(true);
                setSocialNotice(next ? 'XP rejimini söndürdünüz' : 'XP rejimini yandırdınız');
                void setProPanelActive(userId, next)
                  .catch((err) => {
                    setSocialOn(!next);
                    setSocialNotice(null);
                    alert(err instanceof Error ? err.message : 'Sosial rejim dəyişmədi');
                  })
                  .finally(() => setSocialToggling(false));
              }}
            >
              <svg className={profileStyles.socialModeIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </button>
            {socialNotice ? (
              <p className={`${profileStyles.socialModeHint} text-[11px]`} role="status" aria-live="polite">
                {socialNotice}
              </p>
            ) : null}
          </div>
        }
      >
        <div className={profileStyles.statPills}>
          <button
            type="button"
            className={`${profileStyles.statPill} ${profileStyles.statPillBtn}`}
            onClick={() => setFollowListMode('followers')}
          >
            <span className={profileStyles.statPillValue}>{stats.followers}</span>
            <span className={profileStyles.statPillLabel}>{t.followers}</span>
          </button>
          <button
            type="button"
            className={`${profileStyles.statPill} ${profileStyles.statPillBtn}`}
            onClick={() => setFollowListMode('following')}
          >
            <span className={profileStyles.statPillValue}>{stats.following}</span>
            <span className={profileStyles.statPillLabel}>{t.following}</span>
          </button>
          <div className={profileStyles.statPill}>
            <span className={profileStyles.statPillValue}>{stats.likes}</span>
            <span className={profileStyles.statPillLabel}>{t.likes}</span>
          </div>
          <div className={profileStyles.statPill}>
            <span className={profileStyles.statPillValue}>{posts.length}</span>
            <span className={profileStyles.statPillLabel}>Paylaşım</span>
          </div>
        </div>
      </ProfileHeroDisplay>

      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleAvatarFile}
      />
      <input
        ref={bannerInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleBannerFile}
      />

      <ProfilePhotoEditorModal
        open={photoEditor !== null}
        kind={photoEditor?.kind ?? 'avatar'}
        file={photoEditor?.file ?? null}
        onClose={closePhotoEditor}
        onConfirm={(file) => {
          const kind = photoEditor?.kind ?? 'avatar';
          void uploadProfilePhoto(kind, file);
        }}
      />

      <div className={profileStyles.profileQuickRow}>
        <button type="button" className={`${profileStyles.profileQuickBtn} ${profileStyles.quickAlliance}`} onClick={() => setShowAllianceModal(true)}>
          <span className={profileStyles.actionIcon}>🛡️</span>
          İttifaq
        </button>
        <button type="button" className={`${profileStyles.profileQuickBtn} ${profileStyles.quickRank}`} onClick={() => setShowRankModal(true)}>
          <span className={profileStyles.actionIcon}>🏆</span>
          Reytinq
        </button>
        <button type="button" className={`${profileStyles.profileQuickBtn} ${profileStyles.quickGifts}`} onClick={() => setShowGiftsModal(true)}>
          <span className={profileStyles.actionIcon}>🎁</span>
          Hədiyyələr
        </button>
      </div>

      <div className={profileStyles.contentStack}>
        <section className={profileStyles.postsPanel}>
          <div className={profileStyles.postsSectionHead}>
            <h2 className={profileStyles.postsSectionTitle}>{t.postsTitle}</h2>
            <span className={profileStyles.postsSectionCount}>{posts.length} paylaşım</span>
          </div>
          <p className={profileStyles.postsSectionSub}>{t.postsSubtitle} Kəşf et-də görünür.</p>
          {postsLoadError ? (
            <div style={{ textAlign: 'center', padding: 16, color: '#f87171', fontSize: 13 }}>{postsLoadError}</div>
          ) : null}
          {posts.length === 0 ? (
            <div className={profileStyles.postsEmpty}>
              <p className={profileStyles.postsEmptyTitle}>{t.noPosts}</p>
              <p className={profileStyles.postsEmptyHint}>{t.noPostsHint}</p>
            </div>
          ) : (
            <div className={profileStyles.postGridPremium}>
              {posts.map((post) => (
                <div key={post.id} className={profileStyles.postTile} onClick={() => setSelectedPostId(post.id)}>
                  {post.mediaType === 'video' ? (
                    <video src={post.mediaUrl} muted />
                  ) : (
                    <img src={post.mediaUrl} alt={post.title} />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <button type="button" className={profileStyles.uploadFabPremium} onClick={handleOpenUploadModal} aria-label="Paylaş">+</button>

      <FollowListSheet
        open={followListMode !== null}
        onClose={() => setFollowListMode(null)}
        userId={currentUser.id}
        mode={followListMode ?? 'followers'}
        title={followListMode === 'following' ? t.followingList : t.followersList}
        emptyText={followListMode === 'following' ? t.emptyFollowing : t.emptyFollowers}
      />

      {isSuperAdmin(currentUser.id) && (
        <AdminPanel userId={currentUser.id} displayName={`${currentUser.name} ${currentUser.surname}`.trim()} />
      )}

      <AppBottomNav activeTab="profile" />

      {activePost && (
        <div
          className={`${socialStyles.modalOverlay} ${profileStyles.postViewerOverlay}`}
          onClick={closePostViewer}
          role="dialog"
          aria-modal="true"
          aria-label="Paylaşım"
        >
          <div className={profileStyles.postViewerSheet} onClick={(e) => e.stopPropagation()}>
            <div className={profileStyles.postViewerHeader}>
              <h3 className={profileStyles.postViewerTitle}>{activePost.title}</h3>
              <button type="button" className={profileStyles.profileModalClose} onClick={closePostViewer} aria-label="Bağla">✕</button>
            </div>

            <div className={profileStyles.postViewerMedia}>
              {activePost.mediaType === 'video' ? (
                <video src={activePost.mediaUrl} controls playsInline />
              ) : (
                <img src={activePost.mediaUrl} alt={activePost.title} />
              )}
            </div>

            <div className={profileStyles.postViewerBody}>
              <div className={profileStyles.postViewerActions}>
                <div className={profileStyles.postViewerActionGroup}>
                  <button
                    type="button"
                    className={profileStyles.postViewerActionBtn}
                    onClick={() => handleLike(activePost.id)}
                    disabled={activePost.isLiked}
                    aria-label="Bəyən"
                  >
                    <PostActionIcon kind={activePost.isLiked ? 'like-active' : 'like'} alt="Bəyən" size="sm" />
                    <span>{activePost.likes}</span>
                  </button>
                  <button type="button" className={profileStyles.postViewerActionBtn} onClick={() => setIsGiftModalOpen(true)}>
                    🎁 Hədiyyə
                  </button>
                </div>
                <div className={profileStyles.postViewerActionGroup}>
                  <button
                    type="button"
                    className={profileStyles.postViewerActionBtn}
                    onClick={() => void handleSharePost(activePost.id, activePost.title)}
                    aria-label="Paylaş"
                  >
                    <PostActionIcon kind="share" alt="Paylaş" size="sm" />
                  </button>
                  <button type="button" className={profileStyles.postViewerActionBtn} onClick={handleReport} title="Bildir" aria-label="Bildir">
                    <PostActionIcon kind="report" alt="Bildir" size="sm" />
                  </button>
                </div>
              </div>

              <div className={profileStyles.postViewerSection}>
                Alınan hədiyyələr ({activePost.receivedGifts.length})
              </div>
              <div className={profileStyles.postViewerGifts}>
                {activePost.receivedGifts.length === 0 ? (
                  <span style={{ fontSize: 11, color: '#64748b' }}>Hələ hədiyyə yoxdur</span>
                ) : (
                  activePost.receivedGifts.map((g, i) => (
                    <span key={i} title={`${g.name} (${g.price} ₼)`} style={{ fontSize: 22 }}>{g.icon}</span>
                  ))
                )}
              </div>

              <div className={profileStyles.postViewerComments}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>
                  Şərhlər ({viewerComments.length})
                </div>
                {viewerComments.length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center' }}>İlk şərh yazan sən ol!</div>
                ) : (
                  viewerComments.map((c) => (
                    <div key={c.id} className={profileStyles.postViewerCommentItem}>
                      <span style={{ fontWeight: 800, color: '#a5b4fc', marginRight: 6 }}>{c.userName}:</span>
                      {c.text}
                    </div>
                  ))
                )}
              </div>
            </div>

            <form
              className={profileStyles.postViewerCommentForm}
              onSubmit={handleAddComment}
            >
              <input
                type="text"
                placeholder="Şərh yaz..."
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                className={profileStyles.postViewerCommentInput}
              />
              <button type="submit" className={profileStyles.postViewerCommentSubmit} disabled={commentSubmitting}>
                {commentSubmitting ? '...' : 'Göndər'}
              </button>
            </form>

            <div className={profileStyles.postViewerCloseBar}>
              <button type="button" className={profileStyles.postViewerCloseBtn} onClick={closePostViewer}>
                Bağla
              </button>
            </div>
          </div>
        </div>
      )}

      {showWalletModal && (
        <div className={socialStyles.modalOverlay} onClick={() => setShowWalletModal(false)}>
          <div className={socialStyles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 className={socialStyles.modalTitle}>₼ {t.wallet}</h2>
              <button type="button" className={profileStyles.profileModalClose} onClick={() => setShowWalletModal(false)} aria-label="Bağla">✕</button>
            </div>
            <div className={profileStyles.walletModalAmount}>
              {isBalanceVisible ? `${manat.toLocaleString('az-AZ')} Manat` : '••••••'}
            </div>
            <div className={profileStyles.walletModalActions}>
              <button type="button" className={socialStyles.secondaryBtn} onClick={() => setIsBalanceVisible(!isBalanceVisible)}>
                {isBalanceVisible ? t.hide : t.show}
              </button>
              <AppLink href="/shop" className={socialStyles.primaryBtn} style={{ textDecoration: 'none', textAlign: 'center', flex: 1 }}>
                ⚔️ Mağazaya get
              </AppLink>
            </div>
          </div>
        </div>
      )}

      {showAllianceModal && (
        <div className={socialStyles.modalOverlay} onClick={() => setShowAllianceModal(false)}>
          <div className={socialStyles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 className={socialStyles.modalTitle}>🛡️ {t.allianceTitle}</h2>
              <button type="button" className={profileStyles.profileModalClose} onClick={() => setShowAllianceModal(false)} aria-label="Bağla">✕</button>
            </div>
            <AllianceProfileCard title={t.allianceTitle} />
          </div>
        </div>
      )}

      {showRankModal && (
        <div className={socialStyles.modalOverlay} onClick={() => setShowRankModal(false)}>
          <div className={socialStyles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 className={socialStyles.modalTitle}>🏆 {t.rankTitle}</h2>
              <button type="button" className={profileStyles.profileModalClose} onClick={() => setShowRankModal(false)} aria-label="Bağla">✕</button>
            </div>
            <div className={profileStyles.glassCardBody} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 16, background: 'rgba(15,23,42,0.5)' }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{t.activeSeason}</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: '#f1f5f9', margin: '4px 0' }}>Unranked</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.score}: <strong style={{ color: '#f472b6' }}>{stats.activeSeasonScore}</strong></div>
              </div>
              <div className={profileStyles.rankBadge}>🛡️</div>
            </div>
          </div>
        </div>
      )}

      {showGiftsModal && (
        <div className={socialStyles.modalOverlay} onClick={() => setShowGiftsModal(false)}>
          <div className={socialStyles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 className={socialStyles.modalTitle}>🎁 {t.giftGallery} ({allReceivedGifts.length})</h2>
              <button type="button" className={profileStyles.profileModalClose} onClick={() => setShowGiftsModal(false)} aria-label="Bağla">✕</button>
            </div>
            {allReceivedGifts.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>{t.noGifts}</div>
            ) : (
              <div className={profileStyles.giftGrid}>
                {allReceivedGifts.map((gift, idx) => (
                  <div key={idx} className={profileStyles.giftItem}>
                    <div className={profileStyles.giftIcon}>{gift.icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>{gift.name.split(' ')[0]}</div>
                    <div style={{ fontSize: 10, color: '#f472b6', fontWeight: 600 }}>{gift.price} ₼</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {isUploadModalOpen && (
        <div className={socialStyles.modalOverlay} onClick={() => !isUploadingPost && setIsUploadModalOpen(false)}>
          <div className={socialStyles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 className={socialStyles.modalTitle}>Yeni Paylaşım</h2>
              <button type="button" className={profileStyles.profileModalClose} onClick={() => setIsUploadModalOpen(false)} disabled={isUploadingPost} aria-label="Bağla">✕</button>
            </div>
            <form onSubmit={handleCreatePost}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Başlıq</label>
              <input
                type="text"
                placeholder="Paylaşım başlığı..."
                value={newPostTitle}
                onChange={(e) => setNewPostTitle(e.target.value)}
                className={socialStyles.input}
                required
              />
              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Media</label>
              <div className={profileStyles.postPickRow}>
                <button type="button" className={profileStyles.postPickBtn} onClick={() => postGalleryInputRef.current?.click()}>
                  🖼️ Qalereya
                </button>
                <button type="button" className={profileStyles.postPickBtn} onClick={() => postCameraInputRef.current?.click()}>
                  📷 Kamera
                </button>
              </div>
              <input
                ref={postGalleryInputRef}
                type="file"
                accept="image/*,video/*"
                className={profileStyles.hiddenFileInput}
                onChange={handlePostFileChange}
              />
              <input
                ref={postCameraInputRef}
                type="file"
                accept="image/*,video/*"
                capture="environment"
                className={profileStyles.hiddenFileInput}
                onChange={handlePostFileChange}
              />
              {selectedFile && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, textAlign: 'center' }}>
                  Seçildi: {selectedFile.name}
                </div>
              )}
              {filePreviewUrl && (
                <div style={{ textAlign: 'center', maxHeight: 180, overflow: 'hidden', borderRadius: 12, background: '#000', marginBottom: 12 }}>
                  {newPostType === 'video' ? (
                    <video src={filePreviewUrl} style={{ width: '100%', maxHeight: 180, objectFit: 'contain' }} controls muted />
                  ) : (
                    <img src={filePreviewUrl} alt="Preview" style={{ width: '100%', maxHeight: 180, objectFit: 'contain' }} />
                  )}
                </div>
              )}
              <button type="submit" className={socialStyles.primaryBtn} disabled={isUploadingPost || isPreparingFile || !selectedFile || !newPostTitle.trim()}>
                {isUploadingPost ? 'Yüklənir...' : isPreparingFile ? 'Hazırlanır...' : 'Paylaş (24 saat)'}
              </button>
              {isPreparingFile ? (
                <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 8 }}>
                  Fayl optimizasiya olunur...
                </p>
              ) : null}
              {isUploadingPost ? (
                <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 8 }}>
                  Paylaşım göndərilir, zəhmət olmasa gözləyin...
                </p>
              ) : null}
            </form>
          </div>
        </div>
      )}

      {isGiftModalOpen && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalContentStyle, width: '90%', maxWidth: '400px', height: 'auto', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Hədiyyə Seçin</h3>
              <button onClick={() => setIsGiftModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '15px' }}>
              {availableGifts.map(gift => (
                <div 
                  key={gift.id} 
                  onClick={() => handleSendGift(gift)}
                  style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', textAlign: 'center', cursor: 'pointer', background: '#f8fafc' }}
                >
                  <div style={{ fontSize: '30px', marginBottom: '5px' }}>{gift.icon}</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>{gift.name}</div>
                  <div style={{ fontSize: '11px', color: '#4f46e5', fontWeight: 600, marginTop: '4px' }}>{gift.price} ₼</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const fullScreenWrapperStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '100vh',
  backgroundColor: '#ffffff',
  position: 'relative',
  paddingBottom: '80px',
  boxSizing: 'border-box'
};

const topHeaderStandardStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '15px 20px',
  borderBottom: '1px solid #f1f5f9',
  backgroundColor: '#ffffff',
  position: 'sticky',
  top: 0,
  zIndex: 80
};

const mainContentContainerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '800px',
  margin: '0 auto',
  boxSizing: 'border-box'
};

const balanceHeaderContainerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '15px 20px',
  borderBottom: '1px solid #f1f5f9',
  flexWrap: 'wrap',
  gap: '10px'
};

const uploadHeaderBtnStyle: React.CSSProperties = {
  backgroundColor: '#4f46e5',
  color: '#fff',
  border: 'none',
  padding: '8px 14px',
  borderRadius: '8px',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer'
};

const toggleBalanceBtnStyle: React.CSSProperties = {
  backgroundColor: '#f1f5f9',
  color: '#334155',
  border: 'none',
  padding: '8px 12px',
  borderRadius: '8px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer'
};

const headerBannerStyle: React.CSSProperties = {
  height: '160px',
  width: '100%'
};

const profileInfoStyle: React.CSSProperties = {
  padding: '0 20px 20px 20px',
  position: 'relative',
  borderBottom: '1px solid #f1f5f9'
};

const avatarWrapperStyle: React.CSSProperties = {
  width: '90px',
  height: '90px',
  borderRadius: '50%',
  border: '4px solid #fff',
  overflow: 'hidden',
  marginTop: '-45px',
  backgroundColor: '#fff',
  boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
};

const avatarImgStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover'
};

const nameTitleStyle: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 900,
  color: '#0f172a',
  margin: '8px 0 2px 0'
};

const handleTitleStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#64748b',
  fontWeight: 600,
  marginBottom: '15px'
};

const statsContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '20px',
  fontSize: '12px',
  color: '#64748b',
  flexWrap: 'wrap'
};

const gridContainerStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '15px',
  padding: '20px'
};

const postsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
  gap: '15px'
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column'
};

const cardHeaderStyle: React.CSSProperties = {
  padding: '12px 16px',
  backgroundColor: '#f8fafc',
  borderBottom: '1px solid #e2e8f0',
  fontSize: '11px',
  fontWeight: 800,
  color: '#475569',
  letterSpacing: '0.5px'
};

const cardBodyStyle: React.CSSProperties = {
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  flex: 1
};

const iconBoxStyle: React.CSSProperties = {
  width: '36px',
  height: '36px',
  backgroundColor: '#f1f5f9',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '18px',
  flexShrink: 0
};

const cardFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '11px',
  color: '#64748b',
  marginBottom: '12px'
};

const actionButtonStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#4f46e5',
  color: '#fff',
  border: 'none',
  padding: '10px',
  borderRadius: '8px',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer'
};

const registerContainerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '100vh',
  width: '100%',
  backgroundColor: '#f8fafc',
  padding: '20px',
  boxSizing: 'border-box'
};

const registerCardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  padding: '24px',
  borderRadius: '16px',
  boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
  border: '1px solid #e2e8f0'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  fontSize: '12px',
  outline: 'none',
  marginTop: '4px',
  boxSizing: 'border-box'
};

const langBtnStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: '6px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '11px'
};

const bottomNavBarStyle: React.CSSProperties = {
  height: '65px',
  width: '100%',
  backgroundColor: '#ffffff',
  borderTop: '1px solid #f1f5f9',
  display: 'flex',
  justifyContent: 'space-around',
  alignItems: 'center',
  position: 'fixed',
  bottom: 0,
  left: 0,
  zIndex: 90,
  boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.05)'
};

const navItemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textDecoration: 'none',
  gap: '3px'
};

const centerNavItemStyle: React.CSSProperties = {
  width: '52px',
  height: '52px',
  backgroundColor: '#4f46e5',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 4px 15px rgba(79, 70, 229, 0.4)',
  marginTop: '-8px'
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  backgroundColor: 'rgba(0,0,0,0.5)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 100,
  padding: '10px',
  boxSizing: 'border-box'
};

const modalContentStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '750px',
  height: '500px',
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box'
};

const modalBodyGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  height: 'calc(100% - 60px)'
};