// Shop - Chat History
// Chat history viewing feature - cosmetic/social feature

export const CHAT_HISTORY_FEATURE = {
  enabled: true,
  maxMessages: 50,
  retentionDays: 30,
  
  // Chat history display options
  displayOptions: {
    showTimestamps: true,
    showMessageTypes: true,
    showAvatars: true,
    maxPreviewLength: 100
  },
  
  // Features available in chat history
  features: {
    search: true,
    filterByType: true,
    exportChat: false,  // Not enabled - privacy focus
    replayMessages: false  // Not enabled
  },
  
  // Privacy settings
  privacy: {
    userCanDeleteOwn: true,
    adminCanDeleteAny: true,
    retainSystemMessages: true
  }
};

export const CHAT_MESSAGE_TYPES = {
  regular: 'regular',
  system: 'system',
  call: 'call',
  trade: 'trade',
  challenge: 'challenge',
  alliance: 'alliance'
};

export const getChatMessages = (userId: string, limit?: number) => {
  // Mock implementation - would fetch from database in production
  return [
    {
      id: '1',
      type: CHAT_MESSAGE_TYPES.regular,
      from: 'Player1',
      to: userId,
      text: 'Hey! How are you?',
      timestamp: Date.now() - 3600000,
      read: true
    },
    {
      id: '2',
      type: CHAT_MESSAGE_TYPES.system,
      from: 'System',
      to: userId,
      text: 'Welcome to FlameFelix!',
      timestamp: Date.now() - 7200000,
      read: true
    },
    {
      id: '3',
      type: CHAT_MESSAGE_TYPES.call,
      from: 'Player2',
      to: userId,
      text: 'Invite to call',
      timestamp: Date.now() - 86400000,
      read: false
    }
  ].slice(0, limit || CHAT_HISTORY_FEATURE.maxMessages);
};

export const searchChatMessages = (userId: string, query: string) => {
  // Mock search implementation
  return [
    {
      id: '1',
      type: CHAT_MESSAGE_TYPES.regular,
      from: 'Player1',
      text: `Found: ${query} in message`
    }
  ];
};