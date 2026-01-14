/**
 * Chat Event Emitter
 * Lightweight event system for chat-to-messages communication
 * Used to notify Messages screen when first message is sent
 */

type ChatEventListener = (data: any) => void;

class ChatEventEmitter {
  private listeners: Map<string, ChatEventListener[]> = new Map();

  on(event: string, listener: ChatEventListener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  off(event: string, listener: ChatEventListener) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  emit(event: string, data?: any) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => listener(data));
    }
  }
}

export const chatEvents = new ChatEventEmitter();

/**
 * Event types
 */
export const CHAT_EVENTS = {
  FIRST_MESSAGE_SENT: 'first_message_sent',
  CONVERSATION_CLOSED: 'conversation_closed',
  CROSS_LANE_RESOLVED: 'cross_lane_resolved',
} as const;

/**
 * Event data types
 */
export interface FirstMessageSentData {
  conversationId: string; // The real conversation UUID from DB
  peerUserId: string; // The other user's ID (to match against matches)
  messageText: string;
  messageId: string;
  sentAt: string;
}

export interface ConversationClosedData {
  conversationId: string; // The conversation UUID that was closed
  reason: 'block' | 'unmatch' | 'report';
}

export interface CrossLaneResolvedData {
  otherId: string;
  chosenLane: 'pals' | 'match';
}
