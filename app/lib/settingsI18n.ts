import { AppLanguage } from './settingsTypes';

type SettingsStrings = {
  title: string;
  subtitle: string;
  back: string;
  language: string;
  notifications: string;
  notifMessages: string;
  notifLikes: string;
  notifFollowers: string;
  notifAlliance: string;
  notifMarketing: string;
  privacy: string;
  profilePublic: string;
  showOnline: string;
  showActivity: string;
  allowMessages: string;
  everyone: string;
  followersOnly: string;
  nobody: string;
  appearance: string;
  theme: string;
  dark: string;
  light: string;
  system: string;
  reduceMotion: string;
  account: string;
  readReceipts: string;
  autoPlay: string;
  security: string;
  oldPass: string;
  newPass: string;
  savePass: string;
  passNote: string;
  support: string;
  supportText: string;
  phone: string;
  email: string;
  feedback: string;
  feedbackPlaceholder: string;
  send: string;
  saved: string;
  blocked: string;
  blockedHint: string;
  about: string;
  version: string;
  savedSync: string;
  dangerZone: string;
  dangerHint: string;
  freezeAccount: string;
  unfreezeAccount: string;
  deleteAccount: string;
  freezeTitle: string;
  freezeText: string;
  freezeConfirm: string;
  frozenBanner: string;
  deleteTitle: string;
  deleteText: string;
  deleteConfirmWord: string;
  deleteConfirmLabel: string;
  deleteConfirm: string;
  cancel: string;
  accountBusy: string;
  freezeDone: string;
  unfreezeDone: string;
  deleteDone: string;
  accountActionError: string;
  guestAccountHint: string;
  adminDeleteBlocked: string;
  bannedOverlayTitle: string;
  bannedOverlayText: string;
};

export const SETTINGS_I18N: Record<AppLanguage, SettingsStrings> = {
  az: {
    title: 'Ayarlar',
    subtitle: 'Hesab, məxfilik və bildirişlər — avtomatik sinxron',
    back: 'Profil',
    language: 'Dil',
    notifications: 'Bildirişlər',
    notifMessages: 'Mesajlar',
    notifLikes: 'Bəyənmələr',
    notifFollowers: 'Yeni izləyicilər',
    notifAlliance: 'İttifaq hadisələri',
    notifMarketing: 'Kampaniya xəbərləri',
    privacy: 'Məxfilik',
    profilePublic: 'Profil hamıya açıq',
    showOnline: 'Onlayn statusu göstər',
    showActivity: 'Aktivliyi göstər',
    allowMessages: 'Mesaj icazəsi',
    everyone: 'Hamı',
    followersOnly: 'Yalnız izləyənlər',
    nobody: 'Heç kim',
    appearance: 'Görünüş',
    theme: 'Tema',
    dark: 'Qaranlıq',
    light: 'İşıqlı',
    system: 'Sistem',
    reduceMotion: 'Animasiyaları azalt',
    account: 'Hesab',
    readReceipts: 'Oxundu bildirişi',
    autoPlay: 'Videoları avtomatik oynat',
    security: 'Təhlükəsizlik',
    oldPass: 'Cari şifrə',
    newPass: 'Yeni şifrə',
    savePass: 'Şifrəni yenilə',
    passNote: 'Şifrə təhlükəsiz saxlanılır. Dəyişiklik qeydə alınır.',
    support: 'Dəstək',
    supportText: 'Suallarınız üçün bizimlə əlaqə saxlayın.',
    phone: '+994 70 324 28 29',
    email: 'yolustu@gmail.com',
    feedback: 'Geri bildiriş',
    feedbackPlaceholder: 'Təklif və ya irad...',
    send: 'Göndər',
    saved: 'Saxlanıldı',
    blocked: 'Bloklanmışlar',
    blockedHint: 'Mesajlar səhifəsindən istifadəçi bloklaya bilərsən.',
    about: 'Haqqında',
    version: 'Yolüstü v0.1.0',
    savedSync: 'Saxlanıldı və sinxron edildi',
    dangerZone: 'Hesab əməliyyatları',
    dangerHint: 'Dondurma müvəqqətidir. Silmə isə geri qaytarılmır.',
    freezeAccount: 'Hesabı dondur',
    unfreezeAccount: 'Hesabı aktivləşdir',
    deleteAccount: 'Hesabı sil',
    freezeTitle: 'Hesab dondurulsun?',
    freezeText: 'Hesabınız gizlədiləcək və digər bölmələr bağlanacaq. İstədiyiniz vaxt buradan yenidən aktivləşdirə bilərsiniz.',
    freezeConfirm: 'Bəli, dondur',
    frozenBanner: 'Hesabınız dondurulub. Aktivləşdirmək üçün aşağıdakı düyməyə basın.',
    deleteTitle: 'Hesab həmişəlik silinsin?',
    deleteText: 'Profil, oyun məlumatı və ayarlar silinəcək. Bu əməliyyat geri qaytarılmır.',
    deleteConfirmWord: 'SIL',
    deleteConfirmLabel: 'Təsdiq üçün SIL yazın',
    deleteConfirm: 'Hesabı sil',
    cancel: 'Ləğv et',
    accountBusy: 'Gözləyin...',
    freezeDone: 'Hesab donduruldu',
    unfreezeDone: 'Hesab aktivləşdirildi',
    deleteDone: 'Hesab silindi',
    accountActionError: 'Əməliyyat alınmadı. Yenidən cəhd edin.',
    guestAccountHint: 'Bu əməliyyatlar yalnız qeydiyyatlı hesab üçündür.',
    adminDeleteBlocked: 'Admin hesabı silinə bilməz.',
    bannedOverlayTitle: 'Hesab bağlanıb',
    bannedOverlayText: 'Hesabınız administrator tərəfindən dayandırılıb. Dəstəklə əlaqə saxlayın.',
  },
  en: {
    title: 'Settings',
    subtitle: 'Account, privacy & notifications — auto sync',
    back: 'Profile',
    language: 'Language',
    notifications: 'Notifications',
    notifMessages: 'Messages',
    notifLikes: 'Likes',
    notifFollowers: 'New followers',
    notifAlliance: 'Alliance events',
    notifMarketing: 'Promotions',
    privacy: 'Privacy',
    profilePublic: 'Public profile',
    showOnline: 'Show online status',
    showActivity: 'Show activity',
    allowMessages: 'Who can message',
    everyone: 'Everyone',
    followersOnly: 'Followers only',
    nobody: 'Nobody',
    appearance: 'Appearance',
    theme: 'Theme',
    dark: 'Dark',
    light: 'Light',
    system: 'System',
    reduceMotion: 'Reduce motion',
    account: 'Account',
    readReceipts: 'Read receipts',
    autoPlay: 'Auto-play videos',
    security: 'Security',
    oldPass: 'Current password',
    newPass: 'New password',
    savePass: 'Update password',
    passNote: 'Your password is stored securely.',
    support: 'Support',
    supportText: 'Contact us for any questions.',
    phone: '+994 70 324 28 29',
    email: 'yolustu@gmail.com',
    feedback: 'Feedback',
    feedbackPlaceholder: 'Your suggestion...',
    send: 'Send',
    saved: 'Saved',
    blocked: 'Blocked users',
    blockedHint: 'Block users from the Messages page.',
    about: 'About',
    version: 'Yolüstü v0.1.0',
    savedSync: 'Saved and synced',
    dangerZone: 'Account actions',
    dangerHint: 'Freezing is temporary. Deleting cannot be undone.',
    freezeAccount: 'Freeze account',
    unfreezeAccount: 'Reactivate account',
    deleteAccount: 'Delete account',
    freezeTitle: 'Freeze this account?',
    freezeText: 'Your profile will be hidden and other sections will lock. You can reactivate anytime from here.',
    freezeConfirm: 'Yes, freeze',
    frozenBanner: 'Your account is frozen. Tap the button below to reactivate it.',
    deleteTitle: 'Delete this account forever?',
    deleteText: 'Your profile, game data and settings will be removed. This cannot be undone.',
    deleteConfirmWord: 'DELETE',
    deleteConfirmLabel: 'Type DELETE to confirm',
    deleteConfirm: 'Delete account',
    cancel: 'Cancel',
    accountBusy: 'Please wait...',
    freezeDone: 'Account frozen',
    unfreezeDone: 'Account reactivated',
    deleteDone: 'Account deleted',
    accountActionError: 'Something went wrong. Try again.',
    guestAccountHint: 'These actions are only available for registered accounts.',
    adminDeleteBlocked: 'The admin account cannot be deleted.',
    bannedOverlayTitle: 'Account suspended',
    bannedOverlayText: 'An administrator suspended this account. Please contact support.',
  },
  ru: {
    title: 'Настройки',
    subtitle: 'Аккаунт, конфиденциальность — автосинхронизация',
    back: 'Профиль',
    language: 'Язык',
    notifications: 'Уведомления',
    notifMessages: 'Сообщения',
    notifLikes: 'Лайки',
    notifFollowers: 'Подписчики',
    notifAlliance: 'Альянс',
    notifMarketing: 'Реклама',
    privacy: 'Конфиденциальность',
    profilePublic: 'Публичный профиль',
    showOnline: 'Показывать онлайн',
    showActivity: 'Показывать активность',
    allowMessages: 'Кто может писать',
    everyone: 'Все',
    followersOnly: 'Только подписчики',
    nobody: 'Никто',
    appearance: 'Вид',
    theme: 'Тема',
    dark: 'Тёмная',
    light: 'Светлая',
    system: 'Системная',
    reduceMotion: 'Меньше анимаций',
    account: 'Аккаунт',
    readReceipts: 'Уведомления о прочтении',
    autoPlay: 'Автовоспроизведение видео',
    security: 'Безопасность',
    oldPass: 'Текущий пароль',
    newPass: 'Новый пароль',
    savePass: 'Обновить пароль',
    passNote: 'Пароль хранится в защищённом виде.',
    support: 'Поддержка',
    supportText: 'Свяжитесь с нами.',
    phone: '+994 70 324 28 29',
    email: 'yolustu@gmail.com',
    feedback: 'Отзыв',
    feedbackPlaceholder: 'Ваш отзыв...',
    send: 'Отправить',
    saved: 'Сохранено',
    blocked: 'Заблокированные',
    blockedHint: 'Блокировка в разделе Сообщения.',
    about: 'О приложении',
    version: 'Yolüstü v0.1.0',
    savedSync: 'Сохранено и синхронизировано',
    dangerZone: 'Действия с аккаунтом',
    dangerHint: 'Заморозка временная. Удаление нельзя отменить.',
    freezeAccount: 'Заморозить аккаунт',
    unfreezeAccount: 'Разморозить аккаунт',
    deleteAccount: 'Удалить аккаунт',
    freezeTitle: 'Заморозить аккаунт?',
    freezeText: 'Профиль будет скрыт, остальные разделы закроются. Разморозить можно здесь в любой момент.',
    freezeConfirm: 'Да, заморозить',
    frozenBanner: 'Аккаунт заморожен. Нажмите кнопку ниже, чтобы активировать его снова.',
    deleteTitle: 'Удалить аккаунт навсегда?',
    deleteText: 'Профиль, игровые данные и настройки будут удалены. Это необратимо.',
    deleteConfirmWord: 'УДАЛИТЬ',
    deleteConfirmLabel: 'Введите УДАЛИТЬ для подтверждения',
    deleteConfirm: 'Удалить аккаунт',
    cancel: 'Отмена',
    accountBusy: 'Подождите...',
    freezeDone: 'Аккаунт заморожен',
    unfreezeDone: 'Аккаунт активирован',
    deleteDone: 'Аккаунт удалён',
    accountActionError: 'Не удалось выполнить. Попробуйте ещё раз.',
    guestAccountHint: 'Эти действия доступны только зарегистрированным аккаунтам.',
    adminDeleteBlocked: 'Аккаунт администратора удалить нельзя.',
    bannedOverlayTitle: 'Аккаунт заблокирован',
    bannedOverlayText: 'Администратор приостановил этот аккаунт. Свяжитесь с поддержкой.',
  },
  tr: {
    title: 'Ayarlar',
    subtitle: 'Hesap, gizlilik — otomatik senkron',
    back: 'Profil',
    language: 'Dil',
    notifications: 'Bildirimler',
    notifMessages: 'Mesajlar',
    notifLikes: 'Beğeniler',
    notifFollowers: 'Yeni takipçiler',
    notifAlliance: 'İttifak',
    notifMarketing: 'Kampanyalar',
    privacy: 'Gizlilik',
    profilePublic: 'Herkese açık profil',
    showOnline: 'Çevrimiçi göster',
    showActivity: 'Aktiviteyi göster',
    allowMessages: 'Mesaj izni',
    everyone: 'Herkes',
    followersOnly: 'Sadece takipçiler',
    nobody: 'Kimse',
    appearance: 'Görünüm',
    theme: 'Tema',
    dark: 'Karanlık',
    light: 'Aydınlık',
    system: 'Sistem',
    reduceMotion: 'Animasyonları azalt',
    account: 'Hesap',
    readReceipts: 'Okundu bilgisi',
    autoPlay: 'Videoları otomatik oynat',
    security: 'Güvenlik',
    oldPass: 'Mevcut şifre',
    newPass: 'Yeni şifre',
    savePass: 'Şifrəni güncelle',
    passNote: 'Şifre güvenli şekilde saklanır.',
    support: 'Destek',
    supportText: 'Sorularınız için bize ulaşın.',
    phone: '+994 70 324 28 29',
    email: 'yolustu@gmail.com',
    feedback: 'Geri bildirim',
    feedbackPlaceholder: 'Öneriniz...',
    send: 'Gönder',
    saved: 'Kaydedildi',
    blocked: 'Engellenenler',
    blockedHint: 'Mesajlar sayfasından engelleyebilirsiniz.',
    about: 'Hakkında',
    version: 'Yolüstü v0.1.0',
    savedSync: 'Kaydedildi ve senkronize edildi',
    dangerZone: 'Hesap işlemleri',
    dangerHint: 'Dondurma geçicidir. Silme geri alınamaz.',
    freezeAccount: 'Hesabı dondur',
    unfreezeAccount: 'Hesabı etkinleştir',
    deleteAccount: 'Hesabı sil',
    freezeTitle: 'Hesap dondurulsun mu?',
    freezeText: 'Profiliniz gizlenecek ve diğer bölümler kapanacak. İstediğiniz zaman buradan tekrar açabilirsiniz.',
    freezeConfirm: 'Evet, dondur',
    frozenBanner: 'Hesabınız donduruldu. Yeniden açmak için aşağıdaki düğmeye basın.',
    deleteTitle: 'Hesap kalıcı olarak silinsin mi?',
    deleteText: 'Profil, oyun verisi ve ayarlar silinecek. Bu işlem geri alınamaz.',
    deleteConfirmWord: 'SIL',
    deleteConfirmLabel: 'Onay için SIL yazın',
    deleteConfirm: 'Hesabı sil',
    cancel: 'İptal',
    accountBusy: 'Bekleyin...',
    freezeDone: 'Hesap donduruldu',
    unfreezeDone: 'Hesap etkinleştirildi',
    deleteDone: 'Hesap silindi',
    accountActionError: 'İşlem başarısız. Tekrar deneyin.',
    guestAccountHint: 'Bu işlemler yalnızca kayıtlı hesaplar içindir.',
    adminDeleteBlocked: 'Yönetici hesabı silinemez.',
    bannedOverlayTitle: 'Hesap askıya alındı',
    bannedOverlayText: 'Yönetici bu hesabı durdurdu. Destek ile iletişime geçin.',
  },
};

export function getSettingsStrings(lang: AppLanguage) {
  return SETTINGS_I18N[lang] ?? SETTINGS_I18N.az;
}
