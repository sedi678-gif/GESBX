export interface PostComment {
  id: string;
  postId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  text: string;
  createdAt: number;
}

export interface SocialPost {
  id: string;
  userId: string;
  userName: string;
  userHandle: string;
  userAvatar: string;
  userGender?: string;
  userRegion?: string;
  userAge?: number;
  title: string;
  mediaUrl: string;
  mediaType: 'video' | 'image';
  likes: number;
  commentsCount: number;
  giftCount: number;
  createdAt: number;
  expiresAt: number;
}

export interface UserFeedItem {
  userId: string;
  userName: string;
  userHandle: string;
  userAvatar: string;
  userAge?: number;
  userGender?: string;
  userRegion?: string;
  mediaList: {
    id: string;
    mediaUrl: string;
    mediaType: 'video' | 'image';
    title: string;
    createdAt: number;
    likes: number;
    commentsCount: number;
  }[];
  likes: number;
  commentsCount: number;
  giftCount: number;
  boostedUntil?: number;
}

export interface AppUserProfile {
  id: string;
  name: string;
  surname?: string;
  handle: string;
  gender?: string;
  birthDate?: string;
  avatar?: string;
  bannerImage?: string;
  region?: string;
  bio?: string;
  bannerGradient?: string;
  vipTier?: 'none' | 'gold' | 'platinum';
  vipExpiresAt?: number;
  equippedCosmetics?: {
    frameId?: string;
    bannerId?: string;
    nameStyleId?: string;
    badgeId?: string;
  };
  frozen?: boolean;
  banned?: boolean;
  likesReceived?: number;
}

export interface UserReport {
  reporterId: string;
  targetUserId: string;
  targetPostId?: string;
  reason: string;
  type: 'user' | 'post' | 'message';
  createdAt: number;
}
