/** Mərkəzi beyin konfiqurasiyası — bütün səhifələr buradan oxuyur */
export { APP_BUILD_LABEL } from './appVersion';

export const APP_BRAIN_FEATURES = {
  chatUiV2: true,
  allianceFlagImage: true,
  postActionIcons: true,
  shopRedesign: true,
  profileRedesign: true,
  socketMessaging: true,
  socketCalls: true,
  webrtcCalls: true,
  videoCalls: true,
  voiceNotes: true,
  mediaSharing: true,
  locationSharing: true,
  whatsappCallUi: true,
  centralBrain: true,
} as const;

export type AppBrainFeatures = typeof APP_BRAIN_FEATURES;

export interface RealtimeHubState {
  appSocketConnected: boolean;
  onlineUserIds: Record<string, boolean>;
  lastPrivateMessageAt: number;
}

export const EMPTY_REALTIME_HUB: RealtimeHubState = {
  appSocketConnected: false,
  onlineUserIds: {},
  lastPrivateMessageAt: 0,
};
