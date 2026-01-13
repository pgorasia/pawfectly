import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Modal, ActivityIndicator, Alert, Dimensions } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '@/contexts/AuthContext';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import storage from '@/services/storage/storage';
import { 
  getFeedPage, 
  submitSwipe, 
  recordReject,
  recordSkip,
  sendChatRequest,
  sendConnectionRequest,
  undoLastDislike,
  getLanesNeedingRefresh,
  type FeedCursor 
} from '@/services/feed/feedService';
import { useMe } from '@/contexts/MeContext';
import { blockUser } from '@/services/block/blockService';
import { setProfileHidden } from '@/services/profile/statusRepository';
import { supabase } from '@/services/supabase/supabaseClient';
import { FullProfileView } from '@/components/profile/FullProfileView';
import { LikeComposerModal } from '@/components/profile/LikeComposerModal';
import type { ProfileViewPayload } from '@/types/feed';

// Storage for persistence (AsyncStorage in Expo Go, MMKV in production)
const DISLIKE_OUTBOX_KEY = 'dislike_outbox_v1';

// Undo state types
type Lane = 'pals' | 'match';
type DislikeAction = 'reject' | 'pass'; // pass == skip

type SwipeEvent = {
  client_event_id: string;
  target_id: string;
  lane: Lane;
  action: 'reject' | 'skip';
  created_at_ms: number;
  commit_after_ms: number; // now + 10s
  payload: { crossLaneDays?: number; skipDays?: number };
  snapshot: ProfileViewPayload; // for instant undo
  retryCount?: number; // track retry attempts
  lastRetryMs?: number; // last retry timestamp for backoff
};

type PendingUndo = {
  eventId: string;
  action: DislikeAction;
  lane: Lane;
  candidateId: string;
  snapshot: ProfileViewPayload;
  expiresAtMs: number;
  timer: NodeJS.Timeout;
} | null;

// New dislike event system
type DislikeActionNew = 'reject' | 'skip';

type DislikeEvent = {
  eventId: string;            // uuid
  targetId: string;
  lane: Lane;
  action: DislikeActionNew;
  createdAtMs: number;
  commitAfterMs: number;      // now + 10_000
  crossLaneDays?: number;     // reject
  skipDays?: number;          // skip
  snapshot: ProfileViewPayload;
  retryCount?: number;        // track retry attempts
  lastRetryMs?: number;       // last retry timestamp for backoff
};

export default function FeedScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { me } = useMe();
  const scrollViewRef = useRef<ScrollView>(null);
  
  console.log('[FeedScreen] 🔄 Component render (Feed screen mounted)');
  
  // Determine visible lanes and default lane from preferences
  const { visibleTabs, defaultLane } = useMemo(() => {
    const prefs = me.preferencesRaw;
    const hasPals = prefs.pals_enabled;
    const hasMatch = prefs.match_enabled;
    
    console.log('[FeedScreen] 🔄 Updating visible tabs:', {
      pals_enabled: hasPals,
      match_enabled: hasMatch,
      preferencesRaw: me.preferencesRaw,
    });
    
    const tabs: ('match' | 'pals')[] = [
      ...(hasMatch ? ['match' as const] : []),
      ...(hasPals ? ['pals' as const] : []),
    ];
    
    const defaultTab: 'match' | 'pals' = hasMatch ? 'match' : 'pals';
    
    console.log('[FeedScreen] ✅ Visible tabs result:', {
      visibleTabs: tabs,
      defaultLane: defaultTab,
      showTabs: tabs.length === 2,
    });
    
    return { visibleTabs: tabs, defaultLane: defaultTab };
  }, [me.preferencesRaw]);
  
  // Active lane state (user can switch between visible tabs)
  const [lane, setLane] = useState<Lane>(defaultLane);
  
  // Per-lane feed state - separate queues, cursors, and indexes for each lane
  // CRITICAL: Index tracking preserves position per lane (no reset on lane switch)
  const [queueByLane, setQueueByLane] = useState<Record<Lane, ProfileViewPayload[]>>({
    pals: [],
    match: [],
  });
  const [cursorByLane, setCursorByLane] = useState<Record<Lane, FeedCursor | null>>({
    pals: null,
    match: null,
  });
  const [exhaustedByLane, setExhaustedByLane] = useState<Record<Lane, boolean>>({
    pals: false,
    match: false,
  });
  // Index tracking per lane - preserves position when switching lanes
  const [indexByLane, setIndexByLane] = useState<Record<Lane, number>>({
    pals: 0,
    match: 0,
  });
  
  // Current profile for active lane (derived from queue[index])
  const currentProfile = useMemo(() => {
    const queue = queueByLane[lane];
    const index = indexByLane[lane];
    return queue[index] || null;
  }, [queueByLane, indexByLane, lane]);
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const [remainingAccepts, setRemainingAccepts] = useState<number | null>(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [isProfileHidden, setIsProfileHidden] = useState<boolean | null>(null);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [refilling, setRefilling] = useState(false);
  
  // Like modal state
  const [showLikeModal, setShowLikeModal] = useState(false);
  const [likeSource, setLikeSource] = useState<{ type: 'photo' | 'prompt'; refId: string } | null>(null);
  const [hasScrolledPastHero, setHasScrolledPastHero] = useState(false);
  
  // Undo state (legacy - kept for backward compatibility)
  const [lastAction, setLastAction] = useState<'pass' | 'reject' | null>(null);
  const [lastCandidateId, setLastCandidateId] = useState<string | null>(null);
  
  // Local undo state with 10s grace period
  const [pendingUndo, setPendingUndo] = useState<PendingUndo>(null);
  const [outbox, setOutbox] = useState<SwipeEvent[]>([]);
  
  // New dislike event system (in-memory)
  const [pendingUndoNew, setPendingUndoNew] = useState<DislikeEvent | null>(null);
  const [dislikeOutbox, setDislikeOutbox] = useState<DislikeEvent[]>([]);
  
  // Persist dislikeOutbox to storage whenever it changes
  useEffect(() => {
    const persistOutbox = async () => {
      try {
        const json = JSON.stringify(dislikeOutbox);
        await storage.set(DISLIKE_OUTBOX_KEY, json);
      } catch (error) {
        console.error('[FeedScreen] Failed to persist dislikeOutbox:', error);
      }
    };
    
    persistOutbox();
  }, [dislikeOutbox]);
  
  // Hydrate dislikeOutbox from storage on mount
  useEffect(() => {
    const hydrateOutbox = async () => {
      try {
        const stored = await storage.getString(DISLIKE_OUTBOX_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as DislikeEvent[];
          if (Array.isArray(parsed)) {
            setDislikeOutbox(parsed);
            console.log(`[FeedScreen] Hydrated ${parsed.length} dislike events from storage`);
          }
        }
      } catch (error) {
        console.error('[FeedScreen] Failed to hydrate dislikeOutbox:', error);
      }
    };
    
    hydrateOutbox();
  }, []); // Only run on mount
  
  // Update active lane when default lane changes (e.g., preferences updated)
  useEffect(() => {
    // If current lane is not in visible tabs, switch to default
    if (!visibleTabs.includes(lane)) {
      setLane(defaultLane);
    }
  }, [defaultLane, visibleTabs, lane]);

  // Refresh both lanes when preferences change
  useEffect(() => {
    // Serialize all relevant preferences (enablement + filters)
    const currentPrefsStr = JSON.stringify({
      raw: me.preferencesRaw,
      pals: me.preferences['pawsome-pals'],
      match: me.preferences['pawfect-match'],
    });
    
    const prevPrefsStr = prevPreferencesRef.current;
    
    // Skip on initial mount
    if (!prevPrefsStr) {
      prevPreferencesRef.current = currentPrefsStr;
      return;
    }
    
    // Check if preferences actually changed
    if (currentPrefsStr !== prevPrefsStr && user?.id && !loading) {
      console.log('[FeedScreen] Preferences changed, refreshing both lanes');
      refreshBothLanes();
      prevPreferencesRef.current = currentPrefsStr;
      lastRefreshTime.current = Date.now();
    }
  }, [me.preferencesRaw, me.preferences, user?.id, loading, refreshBothLanes]);
  
  // NetInfo: flush events when network returns
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable && dislikeOutbox.length > 0) {
        console.log('[FeedScreen] Network connected, outbox has events to flush');
        // The commit loop will automatically pick up expired events
        // No need to manually trigger, but we log for visibility
      }
    });

    return () => {
      unsubscribe();
    };
  }, [dislikeOutbox.length]);
  
  // Derived: locally suppressed IDs (from outbox and pendingUndo)
  const locallySuppressedIds = useMemo(() => {
    const suppressed = new Set<string>();
    
    // Add IDs from outbox
    outbox.forEach((event) => {
      suppressed.add(event.target_id);
    });
    
    // Add ID from pendingUndo if it exists
    if (pendingUndo) {
      suppressed.add(pendingUndo.candidateId);
    }
    
    return suppressed;
  }, [outbox, pendingUndo]);

  // Helper: check if an ID is locally suppressed (in outbox or pendingUndo)
  const isLocallySuppressed = useCallback(
    (id: string) => {
      return (
        outbox.some((e) => e.target_id === id) ||
        pendingUndo?.candidateId === id ||
        dislikeOutbox.some((e) => e.targetId === id) ||
        pendingUndoNew?.targetId === id
      );
    },
    [outbox, pendingUndo, dislikeOutbox, pendingUndoNew]
  );
  
  // Track last focus time to avoid refreshing too frequently
  const lastRefreshTime = useRef<number>(0);
  
  // Track empty state timeout to prevent placeholder flash
  const emptyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track latest queue state for timeout callback (avoid closure issues)
  const queueStateRef = useRef<{ queueLength: number; hasPendingUndo: boolean }>({
    queueLength: 0,
    hasPendingUndo: false,
  });
  
  // Track previous preferences to detect changes (including filters)
  const prevPreferencesRef = useRef<string | null>(null);

  // Load feed page for a specific lane
  const loadFeedPage = useCallback(
    async (targetLane: Lane, cursor: FeedCursor | null = null, append: boolean = false) => {
      if (!user?.id) return;

      console.log('[FeedScreen] loadFeedPage start:', { targetLane, cursor, append });

      try {
        const result = await getFeedPage(10, cursor, targetLane);

        // Update the specific lane's state
        if (append) {
          setQueueByLane((prev) => ({
            ...prev,
            [targetLane]: [...prev[targetLane], ...result.profiles],
          }));
          // Don't reset index when appending
        } else {
          setQueueByLane((prev) => ({
            ...prev,
            [targetLane]: result.profiles,
          }));
          // Reset index to 0 when not appending (new fetch)
          setIndexByLane((prev) => ({ ...prev, [targetLane]: 0 }));
        }

        setCursorByLane((prev) => ({
          ...prev,
          [targetLane]: result.nextCursor,
        }));
        
        // If server returns empty, mark this lane as exhausted
        setExhaustedByLane((prev) => ({
          ...prev,
          [targetLane]: result.profiles.length === 0,
        }));
        
        console.log('[FeedScreen] loadFeedPage success:', { targetLane, profilesCount: result.profiles.length });
      } catch (error) {
        console.error('[FeedScreen] loadFeedPage error:', error);
      } finally {
        setRefilling(false);
      }
    },
    [user?.id]
  );

  // Initialize: load queue for active lane (only if empty)
  // CRITICAL: Do NOT refetch on lane change - preserve index per lane
  useEffect(() => {
    const initialize = async () => {
      const queue = queueByLane[lane];
      // Only load if queue is empty (initial mount or after reset)
      if (queue.length === 0 && !exhaustedByLane[lane]) {
        console.log('[FeedScreen] Mount: initializing lane:', lane);
        setLoading(true);
        await loadFeedPage(lane, null, false);
        setLoading(false);
        lastRefreshTime.current = Date.now();
      }
    };
    initialize();
  }, []); // Only run on mount - do NOT depend on lane

  // Refresh feed when screen comes into focus (e.g., after resetting dislikes)
  // Check if specific lanes need refresh (after reset) and clear only those lanes
  // IMPORTANT: Don't add pendingUndoNew or dislikeOutbox as dependencies - they change frequently
  // and would cause this to run when we don't want a refresh
  useFocusEffect(
    useCallback(() => {
      const checkAndRefresh = async () => {
        const now = Date.now();
        
        if (!user?.id || loading) return;
        
        // Check if specific lanes need refresh (after reset)
        const lanesToRefresh = await getLanesNeedingRefresh();
        
        if (lanesToRefresh && lanesToRefresh.length > 0) {
          console.log(`[FeedScreen] Clearing and reloading lanes after reset: ${lanesToRefresh.join(', ')}`);
          
          // Clear state for each lane that was reset
          for (const resetLane of lanesToRefresh) {
            setCursorByLane((prev) => ({ ...prev, [resetLane]: null }));
            setQueueByLane((prev) => ({ ...prev, [resetLane]: [] }));
            setIndexByLane((prev) => ({ ...prev, [resetLane]: 0 }));
            setExhaustedByLane((prev) => ({ ...prev, [resetLane]: false }));
          }
          
          // Clear pending undo (profiles may have been reset)
          setPendingUndoNew(null);
          
          // Load first page for active lane
          await loadFeedPage(lane, null, false);
          
          // Optionally prefetch the other lane if it was also reset
          const otherLane: Lane = lane === 'pals' ? 'match' : 'pals';
          const hasOtherLane = me.preferencesRaw[otherLane === 'pals' ? 'pals_enabled' : 'match_enabled'];
          if (lanesToRefresh.includes(otherLane) && hasOtherLane) {
            console.log(`[FeedScreen] Prefetching other lane: ${otherLane}`);
            loadFeedPage(otherLane, null, false).catch(err => 
              console.error(`[FeedScreen] Failed to prefetch ${otherLane}:`, err)
            );
          }
          
          lastRefreshTime.current = now;
        } else if ((now - lastRefreshTime.current) > 2000) {
          // Normal refresh if enough time has passed
          refreshFeed();
          lastRefreshTime.current = now;
        }
      };
      
      checkAndRefresh();
    }, [user?.id, loading, lane, loadFeedPage, refreshFeed, me.preferencesRaw])
  );

  // Current profile is now derived from queue[index] - no separate state needed
  // Position is preserved per lane via indexByLane

  // Cleanup pendingUndo timer on unmount or when pendingUndo changes
  useEffect(() => {
    // Update ref when pendingUndo changes (old system)
    queueStateRef.current.hasPendingUndo = !!pendingUndo || !!pendingUndoNew;
    
    return () => {
      if (pendingUndo?.timer) {
        clearTimeout(pendingUndo.timer);
      }
    };
  }, [pendingUndo, pendingUndoNew]);

  // Auto-expire pendingUndoNew after 10 seconds
  useEffect(() => {
    if (!pendingUndoNew) return;

    const timer = setTimeout(() => {
      console.log('[FeedScreen] Undo grace period expired, clearing pendingUndo');
      setPendingUndoNew(null);
    }, 10_000); // 10 seconds

    return () => {
      clearTimeout(timer);
    };
  }, [pendingUndoNew]);

  // Cleanup empty state timeout on unmount
  useEffect(() => {
    return () => {
      if (emptyTimeoutRef.current) {
        clearTimeout(emptyTimeoutRef.current);
        emptyTimeoutRef.current = null;
      }
    };
  }, []);

  // Background commit loop: process outbox events every ~1 second
  useEffect(() => {
    if (!user?.id) return;

    const commitInterval = setInterval(async () => {
      const now = Date.now();
      
      // Find events ready to commit (commit_after_ms <= now)
      // Also check retry backoff: if lastRetryMs exists, wait 5s between retries
      const readyEvents = outbox.filter((event) => {
        if (event.commit_after_ms > now) {
          return false; // Not ready yet
        }
        
        // If this event has been retried, check backoff
        if (event.lastRetryMs !== undefined) {
          const timeSinceLastRetry = now - event.lastRetryMs;
          if (timeSinceLastRetry < 5000) {
            return false; // Still in backoff period
          }
        }
        
        return true;
      });

      if (readyEvents.length === 0) {
        return; // Nothing to commit
      }

      // Process events one-by-one (non-blocking)
      for (const event of readyEvents) {
        try {
          let result: { ok: boolean; error?: string };

          if (event.action === 'reject') {
            result = await recordReject(
              event.target_id,
              event.lane,
              event.payload.crossLaneDays ?? 30
            );
          } else if (event.action === 'skip') {
            result = await recordSkip(
              event.target_id,
              event.lane,
              event.payload.skipDays ?? 7
            );
          } else {
            console.warn('[FeedScreen] Unknown event action:', event.action);
            continue;
          }

          if (result.ok) {
            // Success: remove from outbox
            setOutbox((prev) => prev.filter((e) => e.client_event_id !== event.client_event_id));
          } else {
            // Failure: update retry info
            const retryCount = (event.retryCount ?? 0) + 1;
            setOutbox((prev) =>
              prev.map((e) =>
                e.client_event_id === event.client_event_id
                  ? {
                      ...e,
                      retryCount,
                      lastRetryMs: now,
                    }
                  : e
              )
            );
            console.warn(
              `[FeedScreen] Failed to commit event ${event.client_event_id}, retry ${retryCount}:`,
              result.error
            );
          }
        } catch (error) {
          // Network or other error: update retry info
          const retryCount = (event.retryCount ?? 0) + 1;
          setOutbox((prev) =>
            prev.map((e) =>
              e.client_event_id === event.client_event_id
                ? {
                    ...e,
                    retryCount,
                    lastRetryMs: now,
                  }
                : e
            )
          );
          console.error(
            `[FeedScreen] Error committing event ${event.client_event_id}, retry ${retryCount}:`,
            error
          );
        }
      }
    }, 1000); // Run every ~1 second

    return () => {
      clearInterval(commitInterval);
    };
  }, [user?.id, outbox]);

  // Background commit loop for dislike events: process dislikeOutbox every ~1 second (batched)
  useEffect(() => {
    if (!user?.id) return;

    const commitInterval = setInterval(async () => {
      const now = Date.now();
      
      // Find events ready to commit (commitAfterMs <= now)
      // Also check retry backoff: if lastRetryMs exists, wait 5s between retries
      const expiredEvents = dislikeOutbox.filter((event) => {
        if (event.commitAfterMs > now) {
          return false; // Not ready yet
        }
        
        // If this event has been retried, check backoff
        if (event.lastRetryMs !== undefined) {
          const timeSinceLastRetry = now - event.lastRetryMs;
          if (timeSinceLastRetry < 5000) {
            return false; // Still in backoff period
          }
        }
        
        return true;
      });

      if (expiredEvents.length === 0) {
        return; // Nothing to commit
      }

      // Take up to 10 events at a time
      const batch = expiredEvents.slice(0, 10);

      try {
        // Prepare batch payload
        const payload = batch.map((e) => ({
          client_event_id: e.eventId,
          target_id: e.targetId,
          lane: e.lane,
          action: e.action, // 'reject' | 'skip'
          cross_lane_days: e.crossLaneDays ?? 30,
          skip_days: e.skipDays ?? 7,
        }));

        // Submit batch
        const { data, error } = await supabase.rpc('submit_dislike_batch', {
          p_events: payload,
        });

        if (error) {
          throw new Error(error.message);
        }

        // Handle response: remove successfully submitted events
        // Assume response is an array of { eventId, ok: boolean } or similar
        // For now, if no error, assume all succeeded
        if (data) {
          // If response includes success info, use it; otherwise assume all succeeded
          const successfulEventIds = new Set<string>();
          
          if (Array.isArray(data)) {
            // If response is array of results
            data.forEach((result: any, index: number) => {
              if (result?.ok !== false) {
                successfulEventIds.add(batch[index].eventId);
              }
            });
          } else {
            // If no detailed response, assume all succeeded
            batch.forEach((e) => successfulEventIds.add(e.eventId));
          }

          // Remove successfully submitted events
          setDislikeOutbox((prev) =>
            prev.filter((e) => !successfulEventIds.has(e.eventId))
          );
        } else {
          // No response data, assume all succeeded
          const successfulEventIds = new Set(batch.map((e) => e.eventId));
          setDislikeOutbox((prev) =>
            prev.filter((e) => !successfulEventIds.has(e.eventId))
          );
        }
      } catch (error) {
        // On failure, update retry info for all events in batch
        const now = Date.now();
        setDislikeOutbox((prev) =>
          prev.map((e) => {
            const inBatch = batch.some((b) => b.eventId === e.eventId);
            if (inBatch) {
              return {
                ...e,
                retryCount: (e.retryCount ?? 0) + 1,
                lastRetryMs: now,
              };
            }
            return e;
          })
        );
        console.error(
          `[FeedScreen] Error committing dislike batch (${batch.length} events):`,
          error
        );
      }
    }, 1000); // Run every ~1 second

    return () => {
      clearInterval(commitInterval);
    };
  }, [user?.id, dislikeOutbox]);

  // Load profile hidden status
  useEffect(() => {
    const loadProfileHidden = async () => {
      if (!user?.id) return;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('is_hidden')
          .eq('user_id', user.id)
          .single();
        
        if (!error && data) {
          setIsProfileHidden(data.is_hidden ?? false);
        }
      } catch (error) {
        console.error('[FeedScreen] Error loading profile hidden status:', error);
      }
    };

    loadProfileHidden();
  }, [user?.id]);

  const handleUnhideProfile = async () => {
    try {
      await setProfileHidden(false);
      setIsProfileHidden(false);
    } catch (error) {
      console.error('[FeedScreen] Failed to unhide profile:', error);
      Alert.alert('Error', 'Failed to unhide profile. Please try again.');
    }
  };

  // Refresh feed: clear current lane's cursor, queue, and index, refetch
  const refreshFeed = useCallback(async () => {
    setCursorByLane((prev) => ({ ...prev, [lane]: null }));
    setQueueByLane((prev) => ({ ...prev, [lane]: [] }));
    setIndexByLane((prev) => ({ ...prev, [lane]: 0 }));
    setExhaustedByLane((prev) => ({ ...prev, [lane]: false }));
    await loadFeedPage(lane, null, false);
  }, [lane, loadFeedPage]);

  // Refresh both lanes: clear all queues/cursors/indexes, refetch active lane
  const refreshBothLanes = useCallback(async () => {
    console.log('[FeedScreen] Refreshing both lanes due to preference change');
    
    // Clear both lanes (queues, cursors, indexes)
    setCursorByLane({ pals: null, match: null });
    setQueueByLane({ pals: [], match: [] });
    setIndexByLane({ pals: 0, match: 0 });
    setExhaustedByLane({ pals: false, match: false });
    
    // Clear pending undo (preferences changed, old undo is stale)
    setPendingUndoNew(null);
    
    // Refetch active lane
    await loadFeedPage(lane, null, false);
    
    // Optionally prefetch the other lane (if enabled)
    const otherLane: Lane = lane === 'match' ? 'pals' : 'match';
    const otherLaneEnabled = otherLane === 'pals' ? me.preferencesRaw.pals_enabled : me.preferencesRaw.match_enabled;
    
    if (otherLaneEnabled) {
      // Prefetch in background without blocking
      loadFeedPage(otherLane, null, false).catch((error) => {
        console.error(`[FeedScreen] Failed to prefetch ${otherLane} lane:`, error);
      });
    }
  }, [lane, loadFeedPage, me.preferencesRaw]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setCursorByLane((prev) => ({ ...prev, [lane]: null }));
    setQueueByLane((prev) => ({ ...prev, [lane]: [] }));
    setIndexByLane((prev) => ({ ...prev, [lane]: 0 }));
    setExhaustedByLane((prev) => ({ ...prev, [lane]: false }));
    await loadFeedPage(lane, null, false);
    setRefreshing(false);
  }, [lane, loadFeedPage]);
  
  // Handle lane switch (match/pals)
  // CRITICAL: Does NOT remount feed screen - only swaps state
  // Preserves index per lane (position is maintained)
  const handleLaneSwitch = useCallback(async (newLane: Lane) => {
    if (newLane === lane) return; // Already on this lane
    
    console.log('[FeedScreen] Lane switch:', lane, '->', newLane);
    setLane(newLane);
    
    // Clear pending undo when switching lanes
    setPendingUndoNew(null);
    
    // Reset scroll state
    setHasScrolledPastHero(false);
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    
    // If new lane's queue is empty, load it (but preserve index)
    if (queueByLane[newLane].length === 0 && !exhaustedByLane[newLane]) {
      setLoading(true);
      try {
        await loadFeedPage(newLane, null, false);
      } catch (error) {
        console.error('[FeedScreen] Failed to load feed for new lane:', error);
      } finally {
        setLoading(false);
      }
    } else {
      // Prefetch if queue is getting low (background)
      const queue = queueByLane[newLane];
      const index = indexByLane[newLane];
      const remaining = queue.length - index;
      const cursor = cursorByLane[newLane];
      if (remaining <= 3 && cursor) {
        loadFeedPage(newLane, cursor, true).catch((error) => {
          console.error('[FeedScreen] Failed to prefetch on lane switch:', error);
        });
      }
    }
  }, [lane, queueByLane, exhaustedByLane, indexByLane, cursorByLane, loadFeedPage]);

  // Advance to next profile in current lane (increment index)
  // CRITICAL: Uses index tracking instead of queue slicing to preserve position
  const advanceToNext = useCallback(() => {
    setIndexByLane((prev) => {
      const newIndex = prev[lane] + 1;
      console.log('[FeedScreen] advanceToNext:', lane, prev[lane], '->', newIndex);
      return { ...prev, [lane]: newIndex };
    });
    
    // Prefetch if queue is getting low (background)
    const queue = queueByLane[lane];
    const index = indexByLane[lane];
    const remaining = queue.length - (index + 1);
    const cursor = cursorByLane[lane];
    if (remaining <= 3 && cursor) {
      loadFeedPage(lane, cursor, true).catch((error) => {
        console.error('[FeedScreen] Failed to prefetch after advance:', error);
      });
    }
    
    // Reset scroll state
    setHasScrolledPastHero(false);
    
    // Scroll to top
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [lane, queueByLane, indexByLane, cursorByLane, loadFeedPage]);

  // Handle swipe actions
  const handleSwipe = useCallback(async (action: 'reject' | 'pass' | 'accept') => {
    if (!user?.id || !currentProfile || swiping) return;

    const candidateId = currentProfile.candidate.user_id;
    setSwiping(true);

    try {
      if (action === 'reject' || action === 'pass') {
        // Optimistic update: create event and enqueue (no RPC call)
        const currentLane = lane;
        const now = Date.now();
        const eventId = Crypto.randomUUID();

        const event: DislikeEvent = {
          eventId,
          targetId: candidateId,
          lane: currentLane,
          action: action === 'reject' ? 'reject' : 'skip',
          createdAtMs: now,
          commitAfterMs: now + 10_000,
          ...(action === 'reject' ? { crossLaneDays: 30 } : { skipDays: 7 }),
          snapshot: currentProfile,
        };

        // Push event to dislikeOutbox
        setDislikeOutbox((prev) => [...prev, event]);

        // Set pendingUndo
        setPendingUndoNew(event);

        // Update legacy undo state for UI compatibility
        setLastAction(action === 'reject' ? 'reject' : 'pass');
        setLastCandidateId(candidateId);

        // Advance immediately (optimistic)
        advanceToNext();
        setSwiping(false);
        return;
      } else if (action === 'accept') {
        const result = await submitSwipe(candidateId, 'accept', lane);

        if (result.ok) {
          if (result.remaining_accepts !== undefined) {
            setRemainingAccepts(result.remaining_accepts);
          }
          // Clear undo state for accept/like actions
          setLastAction(null);
          setLastCandidateId(null);
          advanceToNext();
        } else if (result.error === 'daily_limit_reached') {
          setShowPremiumModal(true);
          // Don't advance - keep current profile
        }
      }
    } catch (error) {
      console.error('[FeedScreen] Failed to submit swipe:', error);
      Alert.alert('Error', 'Failed to submit swipe. Please try again.');
    } finally {
      setSwiping(false);
    }
  }, [user?.id, currentProfile, swiping, advanceToNext, pendingUndo]);

  // Handle heart press (like from photo/prompt)
  const handleHeartPress = useCallback((source: { type: 'photo' | 'prompt'; refId: string }) => {
    setLikeSource(source);
    setShowLikeModal(true);
  }, []);

  // Handle like submission
  const handleLikeSubmit = useCallback(async (message: string | null) => {
    if (!user?.id || !currentProfile || !likeSource) return;

    setShowLikeModal(false);
    setSwiping(true);

    try {
      const candidateId = currentProfile.candidate.user_id;
      
      // Build metadata based on like source
      const metadata: Record<string, any> = {};
      if (likeSource.type === 'photo') {
        metadata.photo_id = likeSource.refId;
      } else if (likeSource.type === 'prompt') {
        metadata.prompt_id = likeSource.refId;
      }

      // Send chat request (atomic: like + message)
      const result = await sendChatRequest(
        candidateId,
        lane,
        message || '', // Empty string if no message
        metadata
      );

      if (!result.ok) {
        if (result.error === 'daily_limit_reached') {
          setShowPremiumModal(true);
          setSwiping(false);
          return;
        }
        throw new Error('Failed to send chat request');
      }

      // Update remaining accepts
      if (result.remaining_accepts !== undefined) {
        setRemainingAccepts(result.remaining_accepts);
      }

      // Advance to next profile
      advanceToNext();
    } catch (error) {
      console.error('[FeedScreen] Failed to process like:', error);
      Alert.alert('Error', 'Failed to send like. Please try again.');
    } finally {
      setSwiping(false);
      setLikeSource(null);
    }
  }, [user?.id, currentProfile, likeSource, advanceToNext, lane]);

  // Handle like button (directly submits like without modal)
  const handleLikeButton = useCallback(async () => {
    if (!currentProfile || swiping) return;

    const candidateId = currentProfile.candidate.user_id;

    setSwiping(true);
    try {
      const res = await submitSwipe(candidateId, 'accept', lane);

      if (res.ok) {
        // Update remaining likes if returned
        if (res.remaining_accepts !== undefined) {
          setRemainingAccepts(res.remaining_accepts);
        }
        advanceToNext();
      } else if (res.error === 'daily_limit_reached') {
        setShowPremiumModal(true);
      } else {
        throw new Error(res.error || 'like_failed');
      }
    } catch (error) {
      console.error('[FeedScreen] Failed to process like:', error);
      Alert.alert('Error', 'Failed to send like. Please try again.');
    } finally {
      setSwiping(false);
    }
  }, [currentProfile, swiping, lane, advanceToNext]);

  const handleBlock = useCallback(async (reason: 'block' | 'report', candidateId: string, humanName: string | null) => {
    if (!user?.id) return;

    const actionText = reason === 'block' ? 'block' : 'report';
    const confirmText = reason === 'block' 
      ? `Are you sure you want to block ${humanName || 'this user'}? They won't appear in your feed anymore.`
      : `Are you sure you want to report ${humanName || 'this user'}? This action cannot be undone.`;

    Alert.alert(
      `${actionText.charAt(0).toUpperCase() + actionText.slice(1)} User`,
      confirmText,
      [
        {
          text: actionText.charAt(0).toUpperCase() + actionText.slice(1),
          style: reason === 'report' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await blockUser(user.id, candidateId, reason);
              // Advance to next profile
              advanceToNext();
              setShowBlockMenu(false);
            } catch (error) {
              console.error('[FeedScreen] Failed to block user:', error);
              Alert.alert('Error', 'Failed to block user. Please try again.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  }, [user?.id, advanceToNext]);

  const handleClosePremiumModal = () => {
    setShowPremiumModal(false);
  };

  const handleUpgrade = () => {
    // TODO: Navigate to premium upgrade screen
    handleClosePremiumModal();
    console.log('[FeedScreen] Premium upgrade clicked');
  };

  // Maintain buffer of at least 10 profiles in the queue for current lane
  useEffect(() => {
    if (!user?.id) return;

    const currentQueue = queueByLane[lane];
    const currentCursor = cursorByLane[lane];

    if (currentQueue.length < 10 && currentCursor && !refilling) {
      setRefilling(true);
      loadFeedPage(lane, currentCursor, true).finally(() => setRefilling(false));
    }
  }, [user?.id, queueByLane, lane, cursorByLane, refilling, loadFeedPage]);

  // Handle undo action (local only, within 10s grace period)
  const handleUndo = useCallback(() => {
    if (!pendingUndoNew) return;

    // Clear empty state timeout to prevent placeholder flash
    if (emptyTimeoutRef.current) {
      clearTimeout(emptyTimeoutRef.current);
      emptyTimeoutRef.current = null;
    }

    // Update ref to reflect undo (queue will be populated)
    queueStateRef.current.hasPendingUndo = false;

    // Remove the event from dislikeOutbox
    setDislikeOutbox((prev) => prev.filter((e) => e.eventId !== pendingUndoNew.eventId));

    const undoneId = pendingUndoNew.targetId;
    const snapshot = pendingUndoNew.snapshot;
    const undoLane = pendingUndoNew.lane;

    // Put the undone profile back at index 0, and move the current profile to front of queue for that lane
    const currentQueue = queueByLane[undoLane];
    const currentIndex = indexByLane[undoLane];
    const currentProfileAtIndex = currentQueue[currentIndex] || null;
    
    setQueueByLane((prev) => {
      const queue = prev[undoLane];
      
      // If there's a current profile, put it at the front of the queue
      if (currentProfileAtIndex) {
        const currentId = currentProfileAtIndex.candidate.user_id;
        // Remove both currentId and undoneId from queue to avoid duplicates
        const rest = queue.filter((p) => 
          p.candidate.user_id !== currentId && 
          p.candidate.user_id !== undoneId
        );
        // Put current profile at the front (it will be next after the undone profile)
        const finalQueue = [currentProfileAtIndex, ...rest];
        queueStateRef.current.queueLength = finalQueue.length;
        return { ...prev, [undoLane]: finalQueue };
      }
      
      // No current profile, just remove undone from queue
      const rest = queue.filter((p) => p.candidate.user_id !== undoneId);
      queueStateRef.current.queueLength = rest.length;
      return { ...prev, [undoLane]: rest };
    });

    // Set index to 0 to show the undone profile
    setIndexByLane((prev) => ({ ...prev, [undoLane]: 0 }));

    // Clear pendingUndo
    setPendingUndoNew(null);

    // Update legacy undo state for UI compatibility
    setLastAction(null);
    setLastCandidateId(null);

    // Reset scroll state
    setHasScrolledPastHero(false);
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [pendingUndoNew, queueByLane, indexByLane]);

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <AppText variant="body" style={styles.loadingText}>
            Loading feed...
          </AppText>
        </View>
      </ScreenContainer>
    );
  }

  const hasProfile = currentProfile !== null;

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <AppText variant="heading" style={styles.appName}>
          Pawfectly
        </AppText>
        <View style={styles.headerRight}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.push('/(tabs)/preferences?from=feed')}
            >
              <IconSymbol name="slider.horizontal.3" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          {hasProfile && (
            <View style={styles.headerBottomRow}>
              {pendingUndoNew && (
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={handleUndo}
                  disabled={swiping}
                >
                  <MaterialIcons name="undo" size={24} color={Colors.primary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => setShowBlockMenu(true)}
              >
                <MaterialIcons name="more-horiz" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Lane Segmented Control - only show if both lanes are enabled */}
      {(() => {
        const shouldShowTabs = visibleTabs.length === 2;
        console.log('[FeedScreen] 🎨 Rendering segmented control:', {
          visibleTabsLength: visibleTabs.length,
          visibleTabs,
          shouldShowTabs,
          willRenderSegmentedControl: shouldShowTabs,
        });
        return shouldShowTabs ? (
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[styles.segment, lane === 'pals' && styles.segmentActive]}
              onPress={() => handleLaneSwitch('pals')}
              disabled={loading}
              activeOpacity={0.7}
            >
              <AppText
                variant="body"
                style={[styles.segmentText, lane === 'pals' && styles.segmentTextActive]}
              >
                Pawsome Pals
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, lane === 'match' && styles.segmentActive]}
              onPress={() => handleLaneSwitch('match')}
              disabled={loading}
              activeOpacity={0.7}
            >
              <AppText
                variant="body"
                style={[styles.segmentText, lane === 'match' && styles.segmentTextActive]}
              >
                Pawfect Match
              </AppText>
            </TouchableOpacity>
          </View>
        ) : null;
      })()}

      {/* Hidden Profile Banner */}
      {isProfileHidden === true && (
        <View style={styles.hiddenBanner}>
          <AppText variant="body" style={styles.hiddenBannerText}>
            Your profile is hidden. You won't appear in the feed.
          </AppText>
          <AppButton
            variant="primary"
            style={styles.hiddenBannerButton}
            onPress={handleUnhideProfile}
          >
            Unhide
          </AppButton>
        </View>
      )}

      {/* Profile Content */}
      <View style={styles.contentContainer}>
        {hasProfile ? (
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
            showsVerticalScrollIndicator={false}
            onScroll={(event) => {
              const offsetY = event.nativeEvent.contentOffset.y;
              const HERO_HEIGHT = Dimensions.get('window').width * 1.2;
              if (offsetY > HERO_HEIGHT * 0.3 && !hasScrolledPastHero) {
                setHasScrolledPastHero(true);
              }
            }}
            scrollEventThrottle={16}
          >
            <FullProfileView
              key={currentProfile.candidate.user_id}
              payload={currentProfile}
              onHeartPress={handleHeartPress}
              hasScrolledPastHero={hasScrolledPastHero}
            />
          </ScrollView>
        ) : exhaustedByLane[lane] && queueByLane[lane].length === 0 ? (
          // Empty state for both lanes
          <View style={styles.emptyContainer}>
            <AppText variant="heading" style={styles.emptyTitle}>
              {lane === 'pals' 
                ? 'No more Pawsome Pals nearby right now.'
                : 'No more Pawfect Matches nearby right now.'}
            </AppText>
            <View style={styles.emptyActionsContainer}>
              <AppButton
                variant="primary"
                onPress={() => router.push('/(tabs)/preferences')}
                style={styles.emptyActionButton}
              >
                Adjust filters
              </AppButton>
            </View>
          </View>
        ) : (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <AppText variant="body" style={styles.loadingText}>
              {refilling ? 'Loading more profiles...' : 'Loading feed...'}
            </AppText>
          </View>
        )}

        {/* Fixed Bottom Action Bar */}
        {hasProfile && (
          <View style={styles.actionBar}>
            <TouchableOpacity
              style={[styles.actionButton, styles.passButton]}
              onPress={() => handleSwipe('reject')}
              disabled={swiping}
              activeOpacity={0.7}
            >
              <MaterialIcons name="close" size={24} color={Colors.error} />
              <AppText variant="caption" style={styles.actionButtonLabel}>
                Pass
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.skipButton]}
              onPress={() => handleSwipe('pass')}
              disabled={swiping}
              activeOpacity={0.7}
            >
              <MaterialIcons name="schedule" size={24} color={Colors.text} />
              <AppText variant="caption" style={styles.actionButtonLabel}>
                Skip
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.likeButton]}
              onPress={handleLikeButton}
              disabled={swiping || (remainingAccepts !== null && remainingAccepts <= 0)}
              activeOpacity={0.7}
            >
              {swiping ? (
                <ActivityIndicator size="small" color={Colors.background} />
              ) : (
                <>
                  <MaterialIcons name="favorite" size={24} color={Colors.background} />
                  <AppText variant="caption" style={styles.likeButtonLabel}>
                    Like
                  </AppText>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Block/Report Menu Modal */}
      <Modal
        visible={showBlockMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBlockMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowBlockMenu(false)}
        >
          <View style={styles.blockMenuContent}>
            <TouchableOpacity
              style={styles.blockMenuItem}
              onPress={() => {
                if (currentProfile) {
                  handleBlock('block', currentProfile.candidate.user_id, currentProfile.candidate.display_name);
                }
              }}
            >
              <MaterialIcons name="block" size={24} color={Colors.text} />
              <AppText variant="body" style={styles.blockMenuText}>
                Block User
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.blockMenuItem}
              onPress={() => {
                if (currentProfile) {
                  handleBlock('report', currentProfile.candidate.user_id, currentProfile.candidate.display_name);
                }
              }}
            >
              <MaterialIcons name="report" size={24} color={Colors.error} />
              <AppText variant="body" style={[styles.blockMenuText, { color: Colors.error }]}>
                Report User
              </AppText>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Premium Upgrade Modal */}
      <Modal
        visible={showPremiumModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleClosePremiumModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <AppText variant="heading" style={styles.modalTitle}>
              Daily Limit Reached
            </AppText>
            <AppText variant="body" style={styles.modalText}>
              You've used all your free likes for today. Upgrade to Premium for unlimited likes!
            </AppText>
            <View style={styles.modalButtons}>
              <AppButton
                variant="ghost"
                style={styles.modalButton}
                onPress={handleClosePremiumModal}
              >
                Maybe Later
              </AppButton>
              <AppButton
                variant="primary"
                style={styles.modalButton}
                onPress={handleUpgrade}
              >
                Upgrade Now
              </AppButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* Like Composer Modal (only shown for heart icon likes) */}
      <LikeComposerModal
        visible={showLikeModal}
        onClose={() => {
          setShowLikeModal(false);
          setLikeSource(null);
        }}
        onSubmit={handleLikeSubmit}
        sourceType={likeSource?.type}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
  },
  appName: {
    fontWeight: 'bold',
  },
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  headerTopRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  headerBottomRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  headerButton: {
    padding: Spacing.sm,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: Colors.background + '80', // Subtle background
    borderRadius: 12,
    padding: 4,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: Colors.primary,
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text + '80', // Semi-transparent when inactive
  },
  segmentTextActive: {
    color: Colors.background,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    marginTop: Spacing.md,
  },
  contentContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    opacity: 0.7,
  },
  emptyActionsContainer: {
    marginTop: Spacing.xl,
    width: '100%',
    maxWidth: 300,
    gap: Spacing.md,
  },
  emptyActionButton: {
    width: '100%',
  },
  laneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.primary + '15', // 15% opacity
    borderRadius: 12,
    marginRight: Spacing.sm,
  },
  laneBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(31, 41, 55, 0.1)',
    backgroundColor: Colors.background,
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: 20,
    minHeight: 56,
    gap: 4,
    maxWidth: 100,
  },
  passButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.error + '80',
  },
  skipButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.text + '60',
  },
  likeButton: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonLabel: {
    marginTop: 2,
    fontWeight: '500',
    fontSize: 12,
    color: Colors.text,
  },
  likeButtonLabel: {
    marginTop: 2,
    fontWeight: '500',
    fontSize: 12,
    color: Colors.background,
  },
  hiddenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFA500',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: 8,
  },
  hiddenBannerText: {
    flex: 1,
    color: '#000',
    marginRight: Spacing.md,
  },
  hiddenBannerButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalTitle: {
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  modalText: {
    textAlign: 'center',
    marginBottom: Spacing.xl,
    opacity: 0.8,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
  },
  modalButton: {
    flex: 1,
  },
  blockMenuContent: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: Spacing.sm,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  blockMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  blockMenuText: {
    flex: 1,
  },
});
