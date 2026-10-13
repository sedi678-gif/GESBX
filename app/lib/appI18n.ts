import { AppLanguage } from './settingsTypes';

export type AppStrings = {
  nav: {
    profile: string;
    shop: string;
    explore: string;
    messages: string;
    alliance: string;
    main: string;
  };
  pages: {
    profile: string;
    shop: string;
    explore: string;
    messages: string;
    alliance: string;
    settings: string;
    dashboard: string;
    ranking: string;
    login: string;
    register: string;
    forgot: string;
  };
  messages: {
    title: string;
    empty: string;
    emptyHint: string;
    placeholder: string;
    recording: string;
    search: string;
    searchPlaceholder: string;
    searchBtn: string;
    attachTitle: string;
    micTitle: string;
    voiceCall: string;
    videoCall: string;
    callIncoming: string;
    callOutgoing: string;
    callConnecting: string;
    callInProgress: string;
    callDecline: string;
    callAccept: string;
    callCancel: string;
    callEnd: string;
    callMute: string;
    callMuted: string;
    callSpeaker: string;
    callSpeakerOff: string;
    callCamera: string;
    callCameraOff: string;
    callEncrypt: string;
    callMore: string;
    callShare: string;
    callAdd: string;
    callMinimize: string;
    callFlip: string;
    viewProfile: string;
    systemHint: string;
    uploadFailed: string;
    micDenied: string;
    galleryDenied: string;
    sending: string;
  };
  explore: {
    title: string;
    empty: string;
    emptyHint: string;
    goProfile: string;
    searchTitle: string;
    viewProfile: string;
    filter: string;
    report: string;
  };
  shop: {
    eyebrow: string;
    title: string;
    frames: string;
    framesHint: string;
    vip: string;
    vipHint: string;
    vipPlus: string;
    vipPlusHint: string;
  };
  ranking: {
    eyebrow: string;
    title: string;
    history: string;
  };
  auth: {
    loginTitle: string;
    loginSubtitle: string;
    registerTitle: string;
    registerSubtitle: string;
    forgotTitle: string;
    forgotSubtitle: string;
    email: string;
    password: string;
    login: string;
    loggingIn: string;
    register: string;
    registering: string;
    forgot: string;
    sendReset: string;
    sending: string;
    backToLogin: string;
    haveAccount: string;
    signIn: string;
    errors: {
      verifyEmail: string;
      banned: string;
      badCreds: string;
      badEmail: string;
      generic: string;
      emailInUse: string;
      weakPassword: string;
      registerFail: string;
      userNotFound: string;
      resetFail: string;
    };
    successRegister: string;
    successReset: string;
  };
  studio: {
    kicker: string;
    create: string;
    channel: string;
    settings: string;
    panel: string;
    content: string;
    analytics: string;
    earn: string;
    open: string;
    control: string;
    followers: string;
    likes: string;
    posts: string;
    noPosts: string;
    latestTitle: string;
    latestMeta: string;
    uploadHint: string;
    analyticsTitle: string;
    last28: string;
    engagement: string;
    daily: string;
    lock: string;
    comments: string;
    noComments: string;
    contentTable: string;
    contentEmpty: string;
    date: string;
    gifts: string;
    video: string;
    photo: string;
    published: string;
    untitled: string;
    earnTitle: string;
    adsHint: string;
    vipHint: string;
    planFree: string;
    planPro: string;
    planVip: string;
    toolsOpen: string;
    buyVip: string;
    wait: string;
    socialOn: string;
    socialOff: string;
    snapshotEmpty: string;
    latestResult: string;
    live: string;
  };
};

const STRINGS: Record<AppLanguage, AppStrings> = {
  az: {
    nav: { profile: 'Profil', shop: 'Mağaza', explore: 'Kəşf et', messages: 'Mesajlar', alliance: 'İttifaq', main: 'Əsas naviqasiya' },
    pages: {
      profile: 'Profil — Yolüstü',
      shop: 'Mağaza — Yolüstü',
      explore: 'Kəşf et — Yolüstü',
      messages: 'Mesajlar — Yolüstü',
      alliance: 'İttifaq — Yolüstü',
      settings: 'Ayarlar — Yolüstü',
      dashboard: 'Kanal paneli — Yolüstü',
      ranking: 'Reytinq — Yolüstü',
      login: 'Giriş — Yolüstü',
      register: 'Qeydiyyat — Yolüstü',
      forgot: 'Şifrə — Yolüstü',
    },
    messages: {
      title: 'Mesajlar',
      empty: 'Söhbət yoxdur',
      emptyHint: '🔍 ilə istifadəçi tap. Mesaj, səs, şəkil və video avtomatik saxlanılır.',
      placeholder: 'Mesaj yaz...',
      recording: 'Səsyazılır... buraxın',
      search: 'İstifadəçi tap',
      searchPlaceholder: 'Ad, @nickname...',
      searchBtn: 'Axtar',
      attachTitle: 'Şəkil və ya video göndər',
      micTitle: 'Səs mesajı — basılı saxla',
      voiceCall: 'Səsli zəng',
      videoCall: 'Video zəng',
      callIncoming: 'Gələn zəng',
      callOutgoing: 'Zəng edilir…',
      callConnecting: 'Qoşulur…',
      callInProgress: 'Danışıq',
      callDecline: 'Rədd et',
      callAccept: 'Cavab ver',
      callCancel: 'Ləğv et',
      callEnd: 'Bitir',
      callMute: 'Səssizə al',
      callMuted: 'Səs aç',
      callSpeaker: 'Hoparlör',
      callSpeakerOff: 'Qulaqlıq',
      callCamera: 'Video',
      callCameraOff: 'Video',
      callEncrypt: 'Uçdan-uca şifrələnmiş',
      callMore: 'Digər',
      callShare: 'Paylaş',
      callAdd: 'Əlavə et',
      callMinimize: 'Kiçilt',
      callFlip: 'Kameranı çevir',
      viewProfile: 'Profilə bax',
      systemHint: 'Mesaj və media məlumatları avtomatik sinxron saxlanılır.',
      uploadFailed: 'Media göndərilmədi. Yenidən cəhd edin.',
      micDenied: 'Mikrofon icazəsi lazımdır.',
      galleryDenied: 'Fayl seçmək üçün icazə verin.',
      sending: 'Göndərilir...',
    },
    explore: {
      title: 'Kəşf et',
      empty: 'Hələ paylaşım yoxdur',
      emptyHint: 'Profildən şəkil və ya video paylaş — burada görünəcək.',
      goProfile: 'Profilə get',
      searchTitle: 'İstifadəçi axtar',
      viewProfile: 'Profilə bax',
      filter: 'Filtrlə',
      report: 'Şikayət et',
    },
    shop: {
      eyebrow: 'Neon Bazar',
      title: 'Mağaza',
      frames: 'Çərçivələr',
      framesHint: 'Profil çərçivələri',
      vip: 'VIP Pass',
      vipHint: 'VIP abunə',
      vipPlus: 'VIP Pass Plus',
      vipPlusHint: 'VIP Plus abunə',
    },
    ranking: { eyebrow: 'Yol Üstü', title: 'Reytinq', history: 'Arena döyüş tarixçəsi' },
    auth: {
      loginTitle: 'Yolüstü — Giriş',
      loginSubtitle: 'Hesabınıza daxil olun',
      registerTitle: 'Yolüstü — Qeydiyyat',
      registerSubtitle: 'Email təsdiqi ilə qeydiyyat',
      forgotTitle: 'Şifrənin bərpası',
      forgotSubtitle: 'Email ünvanınızla şifrənizi sıfırlayın',
      email: 'Email ünvanı',
      password: 'Şifrə',
      login: 'Daxil ol',
      loggingIn: 'Daxil olunur...',
      register: 'Qeydiyyat',
      registering: 'Qeydiyyat olunur...',
      forgot: 'Şifrəmi unutmuşam?',
      sendReset: 'Sıfırlama linki göndər',
      sending: 'Göndərilir...',
      backToLogin: 'Giriş səhifəsinə qayıt?',
      haveAccount: 'Hesabınız var?',
      signIn: 'Daxil ol',
      errors: {
        verifyEmail: 'Zəhmət olmasa daxil olmaq üçün öncə emailinizə göndərilən təsdiq linkinə keçid edin!',
        banned: 'Hesabınız administrator tərəfindən bağlanıb.',
        badCreds: 'Email və ya şifrə yanlışdır!',
        badEmail: 'Keçərsiz email formatı!',
        generic: 'Daxil olmaq mümkün olmadı.',
        emailInUse: 'Bu email ünvanı artıq başqa hesab tərəfindən istifadə olunur!',
        weakPassword: 'Şifrə çox zəifdir. Ən azı 6 simvol olmalıdır!',
        registerFail: 'Qeydiyyat uğursuz oldu.',
        userNotFound: 'Bu email ünvanına uyğun istifadəçi tapılmadı!',
        resetFail: 'Şifrəni sıfırlamaq mümkün olmadı.',
      },
      successRegister: 'Qeydiyyat uğurla tamamlandı! Email ünvanınıza təsdiq linki göndərildi.',
      successReset: 'Şifrəni sıfırlamaq üçün təlimat email ünvanınıza göndərildi! Zəhmət olmasa poçtunuzu yoxlayın.',
    },
    studio: {
      kicker: 'Yolüstü Studio',
      create: '+ Yarat',
      channel: 'Kanal',
      settings: 'Ayarlar',
      panel: 'Panel',
      content: 'Kontent',
      analytics: 'Analitika',
      earn: 'Qazanc',
      open: 'Kanal panelini aç',
      control: 'kanalın nəzarət mərkəzi',
      followers: 'İzləyici',
      likes: 'Bəyənmə',
      posts: 'Kontent',
      noPosts: 'Hələ paylaşım yoxdur.',
      latestTitle: 'Son paylaşımın nəticəsi',
      latestMeta: 'Canlı göstərici',
      uploadHint: 'Hələ paylaşım yoxdur. Yarat düyməsi ilə ilk kontenti yüklə.',
      analyticsTitle: 'Kanal analitikası',
      last28: 'Son 28 gün',
      engagement: 'Əlaqə (bəyənmə + şərh)',
      daily: 'Bəyənmə + şərh (günlük)',
      lock: 'Dərin qrafik Professional panoda açılır. İzləyici və bəyənmə hər kəsə görünür.',
      comments: 'Son şərhlər',
      noComments: 'Bu paylaşımda hələ şərh yoxdur.',
      contentTable: 'Kanal kontenti',
      contentEmpty: 'Kanalın kontent cədvəli burada görünəcək. Yarat ilə ilk paylaşımı yüklə.',
      date: 'Tarix',
      gifts: 'Hədiyyə',
      video: 'Video',
      photo: 'Şəkil',
      published: 'Yayımlandı',
      untitled: 'Başlıqsız',
      earnTitle: 'Qazanc və paket',
      adsHint: 'Reklamsız kanal üçün VIP Professional (birdəfəlik 30 AZN).',
      vipHint: 'VIP Pass aktivdir — reklam yoxdur.',
      planFree: 'Adi Pano — əsas funksiyalar, reklam var',
      planPro: 'Adi Professional — öz analitikan',
      planVip: 'VIP Professional — bütün alətlər, həmişəlik VIP Pass',
      toolsOpen: 'Bütün alətlər açıqdır. Balans:',
      buyVip: 'AZN — VIP Professional al',
      wait: 'Gözləyin…',
      socialOn: 'Sosial rejimi bağla (XP açılacaq)',
      socialOff: 'Sosial rejimi aç (XP sönəcək)',
      snapshotEmpty: 'Hələ paylaşım yoxdur.',
      latestResult: 'Son paylaşım',
      live: 'Canlı göstərici',
    },
  },
  en: {
    nav: { profile: 'Profile', shop: 'Shop', explore: 'Explore', messages: 'Messages', alliance: 'Alliance', main: 'Main navigation' },
    pages: {
      profile: 'Profile — Yolüstü',
      shop: 'Shop — Yolüstü',
      explore: 'Explore — Yolüstü',
      messages: 'Messages — Yolüstü',
      alliance: 'Alliance — Yolüstü',
      settings: 'Settings — Yolüstü',
      dashboard: 'Channel dashboard — Yolüstü',
      ranking: 'Ranking — Yolüstü',
      login: 'Sign in — Yolüstü',
      register: 'Register — Yolüstü',
      forgot: 'Password — Yolüstü',
    },
    messages: {
      title: 'Messages',
      empty: 'No chats',
      emptyHint: 'Find users with 🔍. All media is saved automatically.',
      placeholder: 'Write a message...',
      recording: 'Recording... release',
      search: 'Find user',
      searchPlaceholder: 'Name, @nickname...',
      searchBtn: 'Search',
      attachTitle: 'Send photo or video',
      micTitle: 'Voice message — hold',
      voiceCall: 'Voice call',
      videoCall: 'Video call',
      callIncoming: 'Incoming call',
      callOutgoing: 'Calling…',
      callConnecting: 'Connecting…',
      callInProgress: 'In call',
      callDecline: 'Decline',
      callAccept: 'Accept',
      callCancel: 'Cancel',
      callEnd: 'End',
      callMute: 'Mute',
      callMuted: 'Muted',
      callSpeaker: 'Speaker',
      callSpeakerOff: 'Earpiece',
      callCamera: 'Camera',
      callCameraOff: 'Camera off',
      callEncrypt: 'End-to-end encrypted',
      callMore: 'More',
      callShare: 'Share',
      callAdd: 'Add',
      callMinimize: 'Minimize',
      callFlip: 'Flip camera',
      viewProfile: 'View profile',
      systemHint: 'Messages and media sync automatically.',
      uploadFailed: 'Failed to send media. Try again.',
      micDenied: 'Microphone permission required.',
      galleryDenied: 'Allow file access to attach media.',
      sending: 'Sending...',
    },
    explore: {
      title: 'Explore',
      empty: 'No posts yet',
      emptyHint: 'Share from profile to appear here.',
      goProfile: 'Go to profile',
      searchTitle: 'Search users',
      viewProfile: 'View profile',
      filter: 'Filter',
      report: 'Report',
    },
    shop: {
      eyebrow: 'Neon Bazaar',
      title: 'Shop',
      frames: 'Frames',
      framesHint: 'Profile frames',
      vip: 'VIP Pass',
      vipHint: 'VIP subscription',
      vipPlus: 'VIP Pass Plus',
      vipPlusHint: 'VIP Plus subscription',
    },
    ranking: { eyebrow: 'Yolüstü', title: 'Ranking', history: 'Arena battle history' },
    auth: {
      loginTitle: 'Yolüstü — Sign in',
      loginSubtitle: 'Sign in to your account',
      registerTitle: 'Yolüstü — Register',
      registerSubtitle: 'Register with email verification',
      forgotTitle: 'Reset password',
      forgotSubtitle: 'Reset your password with your email',
      email: 'Email address',
      password: 'Password',
      login: 'Sign in',
      loggingIn: 'Signing in...',
      register: 'Register',
      registering: 'Registering...',
      forgot: 'Forgot password?',
      sendReset: 'Send reset link',
      sending: 'Sending...',
      backToLogin: 'Back to sign in?',
      haveAccount: 'Already have an account?',
      signIn: 'Sign in',
      errors: {
        verifyEmail: 'Please open the verification link sent to your email before signing in.',
        banned: 'Your account has been banned by an administrator.',
        badCreds: 'Incorrect email or password.',
        badEmail: 'Invalid email format.',
        generic: 'Could not sign in.',
        emailInUse: 'This email is already used by another account.',
        weakPassword: 'Password is too weak. Use at least 6 characters.',
        registerFail: 'Registration failed.',
        userNotFound: 'No user found for this email.',
        resetFail: 'Could not reset the password.',
      },
      successRegister: 'Registration complete. A verification link was sent to your email.',
      successReset: 'Password reset instructions were sent to your email.',
    },
    studio: {
      kicker: 'Yolüstü Studio',
      create: '+ Create',
      channel: 'Channel',
      settings: 'Settings',
      panel: 'Dashboard',
      content: 'Content',
      analytics: 'Analytics',
      earn: 'Earn',
      open: 'Open channel dashboard',
      control: 'your channel control center',
      followers: 'Followers',
      likes: 'Likes',
      posts: 'Content',
      noPosts: 'No posts yet.',
      latestTitle: 'Latest post performance',
      latestMeta: 'Live metrics',
      uploadHint: 'No posts yet. Use Create to upload your first content.',
      analyticsTitle: 'Channel analytics',
      last28: 'Last 28 days',
      engagement: 'Engagement (likes + comments)',
      daily: 'Likes + comments (daily)',
      lock: 'Deep charts unlock on Professional. Followers and likes stay visible.',
      comments: 'Latest comments',
      noComments: 'No comments on this post yet.',
      contentTable: 'Channel content',
      contentEmpty: 'Your content table will appear here. Create your first post.',
      date: 'Date',
      gifts: 'Gifts',
      video: 'Video',
      photo: 'Photo',
      published: 'Published',
      untitled: 'Untitled',
      earnTitle: 'Earn and plans',
      adsHint: 'Go ad-free with VIP Professional (one-time 30 AZN).',
      vipHint: 'VIP Pass is active — no ads.',
      planFree: 'Standard — core features, ads on',
      planPro: 'Professional — your own analytics',
      planVip: 'VIP Professional — all tools, lifetime VIP Pass',
      toolsOpen: 'All tools are open. Balance:',
      buyVip: 'AZN — Buy VIP Professional',
      wait: 'Please wait…',
      socialOn: 'Turn social mode off (XP on)',
      socialOff: 'Turn social mode on (XP off)',
      snapshotEmpty: 'No posts yet.',
      latestResult: 'Latest post',
      live: 'Live metrics',
    },
  },
  ru: {
    nav: { profile: 'Профиль', shop: 'Магазин', explore: 'Обзор', messages: 'Сообщения', alliance: 'Альянс', main: 'Основная навигация' },
    pages: {
      profile: 'Профиль — Yolüstü',
      shop: 'Магазин — Yolüstü',
      explore: 'Обзор — Yolüstü',
      messages: 'Сообщения — Yolüstü',
      alliance: 'Альянс — Yolüstü',
      settings: 'Настройки — Yolüstü',
      dashboard: 'Панель канала — Yolüstü',
      ranking: 'Рейтинг — Yolüstü',
      login: 'Вход — Yolüstü',
      register: 'Регистрация — Yolüstü',
      forgot: 'Пароль — Yolüstü',
    },
    messages: {
      title: 'Сообщения',
      empty: 'Нет чатов',
      emptyHint: 'Найдите пользователей через 🔍. Медиа сохраняется автоматически.',
      placeholder: 'Напишите сообщение...',
      recording: 'Запись... отпустите',
      search: 'Найти пользователя',
      searchPlaceholder: 'Имя, @nickname...',
      searchBtn: 'Поиск',
      attachTitle: 'Отправить фото или видео',
      micTitle: 'Голосовое — удерживайте',
      voiceCall: 'Голосовой звонок',
      videoCall: 'Видеозвонок',
      callIncoming: 'Входящий вызов',
      callOutgoing: 'Вызов…',
      callConnecting: 'Соединение…',
      callInProgress: 'Разговор',
      callDecline: 'Отклонить',
      callAccept: 'Ответить',
      callCancel: 'Отмена',
      callEnd: 'Завершить',
      callMute: 'Микрофон',
      callMuted: 'Без звука',
      callSpeaker: 'Динамик',
      callSpeakerOff: 'Динамик выкл.',
      callCamera: 'Камера',
      callCameraOff: 'Камера выкл.',
      callEncrypt: 'Сквозное шифрование',
      callMore: 'Ещё',
      callShare: 'Поделиться',
      callAdd: 'Добавить',
      callMinimize: 'Свернуть',
      callFlip: 'Камера',
      viewProfile: 'Открыть профиль',
      systemHint: 'Сообщения и медиа синхронизируются автоматически.',
      uploadFailed: 'Не удалось отправить медиа.',
      micDenied: 'Нужен доступ к микрофону.',
      galleryDenied: 'Разрешите доступ к файлам.',
      sending: 'Отправка...',
    },
    explore: {
      title: 'Обзор',
      empty: 'Пока нет публикаций',
      emptyHint: 'Поделитесь из профиля — появится здесь.',
      goProfile: 'В профиль',
      searchTitle: 'Поиск пользователей',
      viewProfile: 'Открыть профиль',
      filter: 'Фильтр',
      report: 'Жалоба',
    },
    shop: {
      eyebrow: 'Neon Bazaar',
      title: 'Магазин',
      frames: 'Рамки',
      framesHint: 'Рамки профиля',
      vip: 'VIP Pass',
      vipHint: 'VIP-подписка',
      vipPlus: 'VIP Pass Plus',
      vipPlusHint: 'Подписка VIP Plus',
    },
    ranking: { eyebrow: 'Yolüstü', title: 'Рейтинг', history: 'История боёв арены' },
    auth: {
      loginTitle: 'Yolüstü — Вход',
      loginSubtitle: 'Войдите в аккаунт',
      registerTitle: 'Yolüstü — Регистрация',
      registerSubtitle: 'Регистрация с подтверждением email',
      forgotTitle: 'Сброс пароля',
      forgotSubtitle: 'Сбросьте пароль по email',
      email: 'Email',
      password: 'Пароль',
      login: 'Войти',
      loggingIn: 'Вход...',
      register: 'Регистрация',
      registering: 'Регистрация...',
      forgot: 'Забыли пароль?',
      sendReset: 'Отправить ссылку',
      sending: 'Отправка...',
      backToLogin: 'Вернуться ко входу?',
      haveAccount: 'Уже есть аккаунт?',
      signIn: 'Войти',
      errors: {
        verifyEmail: 'Сначала откройте ссылку подтверждения из письма.',
        banned: 'Аккаунт заблокирован администратором.',
        badCreds: 'Неверный email или пароль.',
        badEmail: 'Неверный формат email.',
        generic: 'Не удалось войти.',
        emailInUse: 'Этот email уже используется.',
        weakPassword: 'Слишком слабый пароль. Минимум 6 символов.',
        registerFail: 'Регистрация не удалась.',
        userNotFound: 'Пользователь с этим email не найден.',
        resetFail: 'Не удалось сбросить пароль.',
      },
      successRegister: 'Регистрация завершена. Ссылка подтверждения отправлена на email.',
      successReset: 'Инструкция по сбросу пароля отправлена на email.',
    },
    studio: {
      kicker: 'Yolüstü Studio',
      create: '+ Создать',
      channel: 'Канал',
      settings: 'Настройки',
      panel: 'Панель',
      content: 'Контент',
      analytics: 'Аналитика',
      earn: 'Доход',
      open: 'Открыть панель канала',
      control: 'центр управления каналом',
      followers: 'Подписчики',
      likes: 'Лайки',
      posts: 'Контент',
      noPosts: 'Пока нет публикаций.',
      latestTitle: 'Результат последней публикации',
      latestMeta: 'Живые метрики',
      uploadHint: 'Пока нет публикаций. Нажмите Создать.',
      analyticsTitle: 'Аналитика канала',
      last28: 'Последние 28 дней',
      engagement: 'Вовлечённость (лайки + комментарии)',
      daily: 'Лайки + комментарии (по дням)',
      lock: 'Глубокий график открывается в Professional. Подписчики и лайки видны всем.',
      comments: 'Последние комментарии',
      noComments: 'Комментариев пока нет.',
      contentTable: 'Контент канала',
      contentEmpty: 'Таблица контента появится здесь.',
      date: 'Дата',
      gifts: 'Подарки',
      video: 'Видео',
      photo: 'Фото',
      published: 'Опубликовано',
      untitled: 'Без названия',
      earnTitle: 'Доход и тариф',
      adsHint: 'Без рекламы — VIP Professional (разово 30 AZN).',
      vipHint: 'VIP Pass активен — без рекламы.',
      planFree: 'Обычная панель — базовые функции, реклама есть',
      planPro: 'Professional — своя аналитика',
      planVip: 'VIP Professional — все инструменты, VIP Pass навсегда',
      toolsOpen: 'Все инструменты открыты. Баланс:',
      buyVip: 'AZN — купить VIP Professional',
      wait: 'Подождите…',
      socialOn: 'Выключить соцрежим (XP включится)',
      socialOff: 'Включить соцрежим (XP выключится)',
      snapshotEmpty: 'Пока нет публикаций.',
      latestResult: 'Последняя публикация',
      live: 'Живые метрики',
    },
  },
  tr: {
    nav: { profile: 'Profil', shop: 'Mağaza', explore: 'Keşfet', messages: 'Mesajlar', alliance: 'İttifak', main: 'Ana gezinme' },
    pages: {
      profile: 'Profil — Yolüstü',
      shop: 'Mağaza — Yolüstü',
      explore: 'Keşfet — Yolüstü',
      messages: 'Mesajlar — Yolüstü',
      alliance: 'İttifak — Yolüstü',
      settings: 'Ayarlar — Yolüstü',
      dashboard: 'Kanal paneli — Yolüstü',
      ranking: 'Sıralama — Yolüstü',
      login: 'Giriş — Yolüstü',
      register: 'Kayıt — Yolüstü',
      forgot: 'Şifre — Yolüstü',
    },
    messages: {
      title: 'Mesajlar',
      empty: 'Sohbet yok',
      emptyHint: '🔍 ile kullanıcı bul. Medya otomatik kaydedilir.',
      placeholder: 'Mesaj yaz...',
      recording: 'Kaydediliyor... bırak',
      search: 'Kullanıcı bul',
      searchPlaceholder: 'Ad, @nickname...',
      searchBtn: 'Ara',
      attachTitle: 'Fotoğraf veya video gönder',
      micTitle: 'Sesli mesaj — basılı tut',
      voiceCall: 'Sesli arama',
      videoCall: 'Görüntülü arama',
      callIncoming: 'Gelen arama',
      callOutgoing: 'Aranıyor…',
      callConnecting: 'Bağlanıyor…',
      callInProgress: 'Görüşme',
      callDecline: 'Reddet',
      callAccept: 'Cevapla',
      callCancel: 'İptal',
      callEnd: 'Bitir',
      callMute: 'Sessize al',
      callMuted: 'Sesi aç',
      callSpeaker: 'Hoparlör',
      callSpeakerOff: 'Ahize',
      callCamera: 'Video',
      callCameraOff: 'Video',
      callEncrypt: 'Uçtan uca şifrelenmiş',
      callMore: 'Diğer',
      callShare: 'Paylaş',
      callAdd: 'Ekle',
      callMinimize: 'Küçült',
      callFlip: 'Kamerayı çevir',
      viewProfile: 'Profile bak',
      systemHint: 'Mesajlar ve medya otomatik senkronize edilir.',
      uploadFailed: 'Medya gönderilemedi.',
      micDenied: 'Mikrofon izni gerekli.',
      galleryDenied: 'Dosya erişimine izin verin.',
      sending: 'Gönderiliyor...',
    },
    explore: {
      title: 'Keşfet',
      empty: 'Henüz paylaşım yok',
      emptyHint: 'Profilden paylaş — burada görünür.',
      goProfile: 'Profile git',
      searchTitle: 'Kullanıcı ara',
      viewProfile: 'Profile bak',
      filter: 'Filtrele',
      report: 'Şikayet',
    },
    shop: {
      eyebrow: 'Neon Bazar',
      title: 'Mağaza',
      frames: 'Çerçeveler',
      framesHint: 'Profil çerçeveleri',
      vip: 'VIP Pass',
      vipHint: 'VIP abonelik',
      vipPlus: 'VIP Pass Plus',
      vipPlusHint: 'VIP Plus abonelik',
    },
    ranking: { eyebrow: 'Yolüstü', title: 'Sıralama', history: 'Arena savaş geçmişi' },
    auth: {
      loginTitle: 'Yolüstü — Giriş',
      loginSubtitle: 'Hesabına giriş yap',
      registerTitle: 'Yolüstü — Kayıt',
      registerSubtitle: 'E-posta doğrulamasıyla kayıt',
      forgotTitle: 'Şifre sıfırlama',
      forgotSubtitle: 'E-posta ile şifreni sıfırla',
      email: 'E-posta',
      password: 'Şifre',
      login: 'Giriş yap',
      loggingIn: 'Giriş yapılıyor...',
      register: 'Kayıt ol',
      registering: 'Kayıt olunuyor...',
      forgot: 'Şifremi unuttum?',
      sendReset: 'Sıfırlama bağlantısı gönder',
      sending: 'Gönderiliyor...',
      backToLogin: 'Giriş sayfasına dön?',
      haveAccount: 'Hesabın var mı?',
      signIn: 'Giriş yap',
      errors: {
        verifyEmail: 'Giriş yapmadan önce e-postadaki doğrulama bağlantısını aç.',
        banned: 'Hesabın yönetici tarafından kapatıldı.',
        badCreds: 'E-posta veya şifre yanlış.',
        badEmail: 'Geçersiz e-posta formatı.',
        generic: 'Giriş yapılamadı.',
        emailInUse: 'Bu e-posta başka bir hesapta kullanılıyor.',
        weakPassword: 'Şifre çok zayıf. En az 6 karakter olmalı.',
        registerFail: 'Kayıt başarısız.',
        userNotFound: 'Bu e-postaya ait kullanıcı bulunamadı.',
        resetFail: 'Şifre sıfırlanamadı.',
      },
      successRegister: 'Kayıt tamamlandı. E-postana doğrulama bağlantısı gönderildi.',
      successReset: 'Şifre sıfırlama talimatı e-postana gönderildi.',
    },
    studio: {
      kicker: 'Yolüstü Studio',
      create: '+ Oluştur',
      channel: 'Kanal',
      settings: 'Ayarlar',
      panel: 'Panel',
      content: 'İçerik',
      analytics: 'Analitik',
      earn: 'Kazanç',
      open: 'Kanal panelini aç',
      control: 'kanal kontrol merkezi',
      followers: 'Takipçi',
      likes: 'Beğeni',
      posts: 'İçerik',
      noPosts: 'Henüz paylaşım yok.',
      latestTitle: 'Son paylaşımın sonucu',
      latestMeta: 'Canlı gösterge',
      uploadHint: 'Henüz paylaşım yok. Oluştur ile ilk içeriği yükle.',
      analyticsTitle: 'Kanal analitiği',
      last28: 'Son 28 gün',
      engagement: 'Etkileşim (beğeni + yorum)',
      daily: 'Beğeni + yorum (günlük)',
      lock: 'Derin grafik Professional panelde açılır. Takipçi ve beğeni herkese görünür.',
      comments: 'Son yorumlar',
      noComments: 'Bu paylaşımda henüz yorum yok.',
      contentTable: 'Kanal içeriği',
      contentEmpty: 'İçerik tablosu burada görünecek.',
      date: 'Tarih',
      gifts: 'Hediye',
      video: 'Video',
      photo: 'Fotoğraf',
      published: 'Yayınlandı',
      untitled: 'Başlıksız',
      earnTitle: 'Kazanç ve paket',
      adsHint: 'Reklamsız kanal için VIP Professional (tek sefer 30 AZN).',
      vipHint: 'VIP Pass aktif — reklam yok.',
      planFree: 'Standart — temel özellikler, reklam var',
      planPro: 'Professional — kendi analitiğin',
      planVip: 'VIP Professional — tüm araçlar, ömür boyu VIP Pass',
      toolsOpen: 'Tüm araçlar açık. Bakiye:',
      buyVip: 'AZN — VIP Professional al',
      wait: 'Bekleyin…',
      socialOn: 'Sosyal modu kapat (XP açılır)',
      socialOff: 'Sosyal modu aç (XP kapanır)',
      snapshotEmpty: 'Henüz paylaşım yok.',
      latestResult: 'Son paylaşım',
      live: 'Canlı gösterge',
    },
  },
};

export function getAppStrings(lang: AppLanguage): AppStrings {
  return STRINGS[lang] ?? STRINGS.az;
}

export function titleForPath(lang: AppLanguage, pathname: string): string | null {
  const t = getAppStrings(lang).pages;
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path.startsWith('/profile')) return t.profile;
  if (path.startsWith('/shop')) return t.shop;
  if (path.startsWith('/explore')) return t.explore;
  if (path.startsWith('/messages')) return t.messages;
  if (path.startsWith('/alliance')) return t.alliance;
  if (path.startsWith('/settings')) return t.settings;
  if (path.startsWith('/dashboard')) return t.dashboard;
  if (path.startsWith('/ranking')) return t.ranking;
  if (path.startsWith('/login')) return t.login;
  if (path.startsWith('/register')) return t.register;
  if (path.startsWith('/forgot-password')) return t.forgot;
  return null;
}
