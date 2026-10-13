export type AppLanguage = 'az' | 'en' | 'ru' | 'tr';

export interface UserSettings {
  userId: string;
  language: AppLanguage;
  notifications: {
    messages: boolean;
    likes: boolean;
    followers: boolean;
    alliance: boolean;
    marketing: boolean;
  };
  privacy: {
    profilePublic: boolean;
    showOnlineStatus: boolean;
    allowMessagesFrom: 'everyone' | 'followers' | 'none';
    showActivity: boolean;
  };
  appearance: {
    theme: 'dark' | 'light' | 'system';
    reduceMotion: boolean;
  };
  account: {
    readReceipts: boolean;
    autoPlayVideos: boolean;
  };
  updatedAt: number;
}

export const DEFAULT_SETTINGS = (userId: string): UserSettings => ({
  userId,
  language: 'az',
  notifications: {
    messages: true,
    likes: true,
    followers: true,
    alliance: true,
    marketing: false,
  },
  privacy: {
    profilePublic: true,
    showOnlineStatus: true,
    allowMessagesFrom: 'everyone',
    showActivity: true,
  },
  appearance: {
    theme: 'dark',
    reduceMotion: false,
  },
  account: {
    readReceipts: true,
    autoPlayVideos: true,
  },
  updatedAt: Date.now(),
});
