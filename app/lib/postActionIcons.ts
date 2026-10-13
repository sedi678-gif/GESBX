export type PostActionIconKind = 'like' | 'like-active' | 'comment' | 'share' | 'report';

const ICON_VERSION = '20260908e';

export const POST_ACTION_ICON_PATHS: Record<PostActionIconKind, string> = {
  like: `/icons/like.png?v=${ICON_VERSION}`,
  'like-active': `/icons/like-active.png?v=${ICON_VERSION}`,
  comment: `/icons/comment.png?v=${ICON_VERSION}`,
  share: `/icons/share.png?v=${ICON_VERSION}`,
  report: `/icons/report.png?v=${ICON_VERSION}`,
};

export const POST_ACTION_ICON_FALLBACK: Record<PostActionIconKind, string> = {
  like: '❤️',
  'like-active': '💗',
  comment: '💬',
  share: '↗️',
  report: '⚠️',
};
