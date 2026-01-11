import { supabase } from '@/services/supabase/supabaseClient';
import { publicPhotoUrl } from '@/utils/photoUrls';

// ============================================================================
// Types matching public.get_messages_home and public.get_incoming_requests
// ============================================================================

export type Lane = 'pals' | 'match';

export interface Match {
  conversation_id?: string; // Optional - may not exist yet for new matches
  user_id: string;
  lane: Lane;
  connected_at: string;
  display_name: string;
  dog_name: string | null;
  hero_storage_path: string | null;
}

export interface Thread {
  conversation_id: string;
  user_id: string;
  lane: Lane;
  last_message_at: string;
  preview: string | null;
  unread_count: number;
  display_name: string;
  dog_name: string | null;
  hero_storage_path: string | null;
}

export interface SentRequest {
  conversation_id: string;
  user_id: string;
  lane: Lane;
  created_at: string;
  preview: string | null;
  display_name: string;
  dog_name: string | null;
  hero_storage_path: string | null;
}

export interface IncomingRequest {
  conversation_id: string;
  user_id: string;
  lane: Lane;
  created_at: string;
  preview: string | null;
  display_name: string;
  dog_name: string | null;
  hero_storage_path: string | null;
}

export interface MessagesHomeResponse {
  matches: Match[];
  threads: Thread[];
  sent_requests: SentRequest[];
  liked_you_count: number;
}

export interface IncomingRequestsResponse {
  requests: IncomingRequest[];
}

export type ConversationMessagesCursor = {
  beforeCreatedAt: string; // ISO timestamp
  beforeId: string;        // uuid
} | null;

export type ConversationMessageDTO = {
  id: string;
  sender_id: string;
  kind: string;
  body: string;
  metadata: any;
  created_at: string;
};

export interface SendChatRequestParams {
  targetId: string;
  lane: 'pals' | 'match';
  text: string;
  metadata?: Record<string, any>;
  clientMessageId?: string; // Optional - will be generated if not provided
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Generate a UUID v4 for client message IDs
 */
function generateClientMessageId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get the messages home data including matches, threads, sent requests, and liked_you count
 * Calls public.get_messages_home(p_limit int)
 */
export async function getMessagesHome(limit: number = 50): Promise<MessagesHomeResponse> {
  const { data, error } = await supabase.rpc('get_messages_home', {
    p_limit: limit,
  });

  if (error) {
    console.error('[messagesService] getMessagesHome error:', error);
    throw new Error(error.message);
  }

  // Defensive: ensure all arrays exist
  return {
    matches: data?.matches || [],
    threads: data?.threads || [],
    sent_requests: data?.sent_requests || [],
    liked_you_count: data?.liked_you_count || 0,
  };
}

/**
 * Get all incoming connection requests
 * Calls public.get_incoming_requests(p_limit int)
 */
export async function getIncomingRequests(limit: number = 50): Promise<IncomingRequest[]> {
  const { data, error } = await supabase.rpc('get_incoming_requests', {
    p_limit: limit,
  });

  if (error) {
    console.error('[messagesService] getIncomingRequests error:', error);
    throw new Error(error.message);
  }

  // Defensive: ensure array exists
  return data?.requests || [];
}

/**
 * Convert storage path to public photo URL
 * Re-exported from utils for convenience
 */
export { publicPhotoUrl as toPublicPhotoUrl };

/**
 * Get or create a conversation with another user
 * RPC: ensure_conversation
 * Returns conversation_id (UUID) and status
 */
export async function getOrCreateConversation(
  otherUserId: string,
  lane: 'pals' | 'match' = 'match'
): Promise<{
  conversation_id: string;
  status: 'request' | 'active';
}> {
  const { data, error } = await supabase.rpc('ensure_conversation', {
    p_target_id: otherUserId,
    p_lane: lane,
  });

  if (error) {
    console.error('[messagesService] getOrCreateConversation error:', error);
    throw new Error(error.message);
  }

  const conversationId = data?.conversation_id;

  // Strict UUID guard
  if (!conversationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)) {
    console.error('[messagesService] getOrCreateConversation returned non-uuid conversation_id:', data);
    throw new Error('Invalid conversation_id returned from server');
  }

  return {
    conversation_id: conversationId,
    status: (data?.status as 'request' | 'active') || 'active',
  };
}

/**
 * Send a chat request to another user
 */
export async function sendChatRequest(params: SendChatRequestParams): Promise<{
  data: { conversation_id: string } | null;
  error: Error | null;
}> {
  try {
    const clientMessageId = params.clientMessageId || generateClientMessageId();

    const { data, error } = await supabase.rpc('send_chat_request', {
      target_id: params.targetId,
      lane: params.lane,
      text: params.text,
      metadata: params.metadata || {},
      p_client_message_id: clientMessageId,
    });

    if (error) {
      console.error('[messagesService] sendChatRequest error:', error);
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as { conversation_id: string }, error: null };
  } catch (err) {
    console.error('[messagesService] sendChatRequest exception:', err);
    return { data: null, error: err as Error };
  }
}

/**
 * Accept an incoming connection request
 */
export async function acceptRequest(conversationId: string): Promise<{
  data: { success: boolean } | null;
  error: Error | null;
}> {
  try {
    console.log('[messagesService] acceptRequest calling RPC:', { conversationId });

    const { data, error } = await supabase.rpc('accept_request', {
      p_conversation_id: conversationId,
    });

    if (error) {
      console.error('[messagesService] acceptRequest RPC error:', {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return { data: null, error: new Error(error.message || 'Failed to accept request') };
    }

    // Log the response for debugging
    console.log('[messagesService] acceptRequest response:', data);

    // Check if response indicates success (could be { ok: true } or { success: true })
    const result = data as { ok?: boolean; success?: boolean } | null;
    const isSuccess = result?.ok === true || result?.success === true;

    if (!isSuccess) {
      const errorMsg = `accept_request returned unsuccessful result: ${JSON.stringify(result)}`;
      console.error('[messagesService]', errorMsg);
      return { data: null, error: new Error(errorMsg) };
    }

    console.log('[messagesService] acceptRequest completed successfully');
    return { data: { success: true }, error: null };
  } catch (err) {
    console.error('[messagesService] acceptRequest exception:', err);
    return { data: null, error: err as Error };
  }
}

/**
 * Reject an incoming connection request
 */
export async function rejectRequest(conversationId: string): Promise<{
  data: { success: boolean } | null;
  error: Error | null;
}> {
  try {
    console.log('[messagesService] rejectRequest calling RPC:', { conversationId });

    const { data, error } = await supabase.rpc('reject_request', {
      p_conversation_id: conversationId,
    });

    if (error) {
      console.error('[messagesService] rejectRequest RPC error:', {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return { data: null, error: new Error(error.message || 'Failed to reject request') };
    }

    // Log the response for debugging
    console.log('[messagesService] rejectRequest response:', data);

    // Check if response indicates success (could be { ok: true } or { success: true })
    const result = data as { ok?: boolean; success?: boolean } | null;
    const isSuccess = result?.ok === true || result?.success === true;

    if (!isSuccess) {
      const errorMsg = `reject_request returned unsuccessful result: ${JSON.stringify(result)}`;
      console.error('[messagesService]', errorMsg);
      return { data: null, error: new Error(errorMsg) };
    }

    console.log('[messagesService] rejectRequest completed successfully');
    return { data: { success: true }, error: null };
  } catch (err) {
    console.error('[messagesService] rejectRequest exception:', err);
    return { data: null, error: err as Error };
  }
}

/**
 * Get messages for a specific conversation with pagination
 */
export async function getConversationMessages(
  conversationId: string,
  limit: number = 30,
  cursor: ConversationMessagesCursor = null
): Promise<{ messages: ConversationMessageDTO[]; nextCursor: ConversationMessagesCursor }> {
  const { data, error } = await supabase.rpc('get_conversation_messages', {
    p_conversation_id: conversationId,
    p_before_created_at: cursor?.beforeCreatedAt ?? null,
    p_before_id: cursor?.beforeId ?? null,
    p_limit: limit,
  });

  if (error) {
    console.error('[messagesService] getConversationMessages error:', error);
    throw new Error(error.message);
  }

  // data is a JSON object like { messages: [...] }
  const messages: ConversationMessageDTO[] = (data?.messages ?? []) as ConversationMessageDTO[];

  // For "load older", the next cursor should reference the OLDEST message we have.
  const oldest = messages.length ? messages[0] : null;

  const nextCursor: ConversationMessagesCursor =
    oldest?.created_at && oldest?.id
      ? { beforeCreatedAt: oldest.created_at, beforeId: oldest.id }
      : null;

  return { messages, nextCursor };
}

/**
 * Send a message in an existing conversation
 */
export async function sendMessage(
  conversationId: string,
  body: string,
  kind: string = 'text',
  metadata: Record<string, any> = {},
  clientMessageId?: string
): Promise<{
  data: { message_id: string } | null;
  error: Error | null;
}> {
  try {
    // Validate conversationId is a valid UUID
    if (!conversationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)) {
      const errorMsg = `Invalid conversationId: "${conversationId}". Expected UUID format.`;
      console.error('[messagesService] sendMessage:', errorMsg);
      return { data: null, error: new Error(errorMsg) };
    }

    const finalClientMessageId = clientMessageId || generateClientMessageId();

    // Validate clientMessageId is a valid UUID
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalClientMessageId)) {
      const errorMsg = `Invalid clientMessageId: "${finalClientMessageId}". Expected UUID format.`;
      console.error('[messagesService] sendMessage:', errorMsg);
      return { data: null, error: new Error(errorMsg) };
    }

    // Ensure metadata is always an object (never null or undefined)
    const finalMetadata = metadata || {};

    // Prepare RPC parameters
    const rpcParams = {
      p_conversation_id: conversationId,      // uuid
      p_body: body,                           // text
      p_kind: kind,                           // text
      p_metadata: finalMetadata,              // jsonb - always an object
      p_client_message_id: finalClientMessageId, // uuid
    };

    console.log('[messagesService] sendMessage calling RPC with params:', {
      ...rpcParams,
      p_metadata_type: typeof finalMetadata,
      p_metadata_stringified: JSON.stringify(finalMetadata),
    });

    const { data, error } = await supabase.rpc('send_message', rpcParams);

    if (error) {
      console.error('[messagesService] sendMessage error:', {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        params_sent: {
          p_conversation_id: conversationId,
          p_body: body,
          p_kind: kind,
          p_metadata: finalMetadata,
          p_client_message_id: finalClientMessageId,
        },
      });
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as { message_id: string }, error: null };
  } catch (err) {
    console.error('[messagesService] sendMessage exception:', err);
    return { data: null, error: err as Error };
  }
}

/**
 * Mark all messages in a conversation as read
 */
export async function markConversationRead(conversationId: string): Promise<{
  data: { success: boolean } | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
    });

    if (error) {
      console.error('[messagesService] markConversationRead error:', error);
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as { success: boolean }, error: null };
  } catch (err) {
    console.error('[messagesService] markConversationRead exception:', err);
    return { data: null, error: err as Error };
  }
}

/**
 * Close a conversation (soft delete/hide)
 */
export async function closeConversation(
  conversationId: string,
  forBoth: boolean,
  reason: 'block' | 'unmatch' | 'report'
): Promise<{
  data: { success: boolean } | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase.rpc('close_conversation', {
      p_conversation_id: conversationId,
      p_for_both: forBoth,
      p_reason: reason,
    });

    if (error) {
      console.error('[messagesService] closeConversation error:', error);
      return { data: null, error: new Error(error.message) };
    }

    // The RPC returns { ok: true, ... }, check for ok field
    const result = data as { ok: boolean } | null;
    return { data: result?.ok ? { success: true } : null, error: null };
  } catch (err) {
    console.error('[messagesService] closeConversation exception:', err);
    return { data: null, error: err as Error };
  }
}

/**
 * Unmatch with a user
 * - Deletes conversation and all messages for both users
 * - Registers "pass" for the candidate in all active lanes
 * - No notifications to candidate
 */
export async function unmatchUser(
  targetId: string,
  conversationId: string
): Promise<{
  data: { success: boolean } | null;
  error: Error | null;
}> {
  try {
    console.log('[messagesService] Unmatching user:', { targetId, conversationId });

    const { data, error } = await supabase.rpc('unmatch_user', {
      p_target_id: targetId,
      p_conversation_id: conversationId,
    });

    if (error) {
      console.error('[messagesService] unmatch_user RPC error:', {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return { data: null, error: new Error(error.message || 'Failed to unmatch user') };
    }

    // Log the response for debugging
    console.log('[messagesService] unmatch_user response:', data);

    // Check if response indicates success (could be { ok: true } or { success: true })
    const result = data as { ok?: boolean; success?: boolean } | null;
    const isSuccess = result?.ok === true || result?.success === true;

    if (!isSuccess) {
      const errorMsg = `unmatch_user returned unsuccessful result: ${JSON.stringify(result)}`;
      console.error('[messagesService]', errorMsg);
      return { data: null, error: new Error(errorMsg) };
    }

    console.log('[messagesService] Unmatch completed successfully');
    return { data: { success: true }, error: null };
  } catch (err) {
    console.error('[messagesService] unmatchUser exception:', err);
    return { data: null, error: err as Error };
  }
}

/**
 * Report a user
 * - Deletes conversation and all messages for both users
 * - Tracks report for flagging if reported by multiple users
 */
export async function reportUser(
  targetId: string,
  reason: string,
  details: string | null,
  conversationId: string
): Promise<{
  data: { success: boolean } | null;
  error: Error | null;
}> {
  try {
    console.log('[messagesService] Reporting user:', { targetId, reason, details, conversationId });

    const { data, error } = await supabase.rpc('report_user', {
      p_target_id: targetId,
      p_reason: reason,
      p_details: details,
      p_conversation_id: conversationId,
    });

    if (error) {
      console.error('[messagesService] report_user RPC error:', {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return { data: null, error: new Error(error.message || 'Failed to report user') };
    }

    // Log the response for debugging
    console.log('[messagesService] report_user response:', data);

    // Check if response indicates success (could be { ok: true } or { success: true })
    const result = data as { ok?: boolean; success?: boolean } | null;
    const isSuccess = result?.ok === true || result?.success === true;

    if (!isSuccess) {
      const errorMsg = `report_user returned unsuccessful result: ${JSON.stringify(result)}`;
      console.error('[messagesService]', errorMsg);
      return { data: null, error: new Error(errorMsg) };
    }

    console.log('[messagesService] Report completed successfully');
    return { data: { success: true }, error: null };
  } catch (err) {
    console.error('[messagesService] reportUser exception:', err);
    return { data: null, error: err as Error };
  }
}
