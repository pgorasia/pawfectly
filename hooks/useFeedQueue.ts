/**
 * Feed Queue Hook
 * Manages lane-scoped feed state with index tracking for position preservation
 * 
 * CRITICAL: Switching lanes does NOT remount the feed screen - it only swaps state.
 * This hook ensures each lane maintains its own queue, cursor, index, and loading state.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ProfileViewPayload } from '@/types/feed';
import { getFeedPage, type FeedCursor } from '@/services/feed/feedService';

export type Lane = 'pals' | 'match';

export interface LaneState {
  queue: ProfileViewPayload[];
  index: number; // Current position in queue (preserves position per lane)
  cursor: FeedCursor | null;
  isLoading: boolean;
  hasMore: boolean;
}

interface UseFeedQueueReturn {
  activeLane: Lane;
  setActiveLane: (lane: Lane) => void;
  getActiveState: () => LaneState;
  pals: LaneState;
  match: LaneState;
  advanceCard: (lane: Lane) => void;
  ensurePrefetch: (lane: Lane, minBuffer?: number) => Promise<void>;
  loadFeedPage: (lane: Lane, cursor: FeedCursor | null, append: boolean) => Promise<void>;
  resetLane: (lane: Lane) => void;
  getCurrentCard: (lane: Lane) => ProfileViewPayload | null;
  undoCard: (lane: Lane, profile: ProfileViewPayload, currentProfile?: ProfileViewPayload | null) => void;
}

const INITIAL_LANE_STATE: LaneState = {
  queue: [],
  index: 0,
  cursor: null,
  isLoading: false,
  hasMore: true,
};

export function useFeedQueue(
  initialLane: Lane = 'match',
  userId: string | undefined
): UseFeedQueueReturn {
  const [activeLane, setActiveLaneState] = useState<Lane>(initialLane);
  const [pals, setPals] = useState<LaneState>(INITIAL_LANE_STATE);
  const [match, setMatch] = useState<LaneState>(INITIAL_LANE_STATE);
  
  // Track initialization per lane to avoid duplicate fetches
  const initializedLanesRef = useRef<Set<Lane>>(new Set());
  
  // Track if initial mount has happened
  const isMountedRef = useRef(false);
  
  // Load feed page for a specific lane
  const loadFeedPage = useCallback(
    async (lane: Lane, cursor: FeedCursor | null = null, append: boolean = false) => {
      if (!userId) {
        console.log(`[useFeedQueue] loadFeedPage(${lane}) skipped: no userId`);
        return;
      }
      
      const setLaneState = lane === 'pals' ? setPals : setMatch;
      
      // Prevent duplicate concurrent loads
      setLaneState((prev) => {
        if (prev.isLoading) {
          console.log(`[useFeedQueue] loadFeedPage(${lane}) skipped: already loading`);
          return prev;
        }
        return { ...prev, isLoading: true };
      });
      
      console.log(`[useFeedQueue] loadFeedPage(${lane}) start:`, { cursor, append });
      
      try {
        const result = await getFeedPage(10, cursor, lane);
        
        setLaneState((prev) => {
          const newQueue = append ? [...prev.queue, ...result.profiles] : result.profiles;
          const newIndex = append ? prev.index : 0; // Reset index only if not appending
          
          console.log(`[useFeedQueue] loadFeedPage(${lane}) success:`, {
            profilesCount: result.profiles.length,
            queueLength: newQueue.length,
            newIndex,
            hasMore: result.nextCursor !== null,
          });
          
          return {
            queue: newQueue,
            index: newIndex,
            cursor: result.nextCursor,
            isLoading: false,
            hasMore: result.nextCursor !== null,
          };
        });
      } catch (error) {
        console.error(`[useFeedQueue] loadFeedPage(${lane}) error:`, error);
        setLaneState((prev) => ({
          ...prev,
          isLoading: false,
        }));
      }
    },
    [userId]
  );
  
  // Set active lane (does NOT trigger fetch - just swaps state)
  const setActiveLane = useCallback((lane: Lane) => {
    if (lane === activeLane) return;
    console.log(`[useFeedQueue] setActiveLane: ${activeLane} -> ${lane}`);
    setActiveLaneState(lane);
  }, [activeLane]);
  
  // Get current state for a lane
  const getActiveState = useCallback((): LaneState => {
    return activeLane === 'pals' ? pals : match;
  }, [activeLane, pals, match]);
  
  // Get current card for a lane (queue[index])
  const getCurrentCard = useCallback((lane: Lane): ProfileViewPayload | null => {
    const state = lane === 'pals' ? pals : match;
    return state.queue[state.index] || null;
  }, [pals, match]);
  
  // Advance to next card in a lane (increment index)
  const advanceCard = useCallback((lane: Lane) => {
    const setLaneState = lane === 'pals' ? setPals : setMatch;
    
    setLaneState((prev) => {
      const newIndex = prev.index + 1;
      console.log(`[useFeedQueue] advanceCard(${lane}): ${prev.index} -> ${newIndex}`);
      return { ...prev, index: newIndex };
    });
  }, []);
  
  // Undo: insert profile at index and set index to 0 (for undo functionality)
  const undoCard = useCallback((lane: Lane, profile: ProfileViewPayload, currentProfile?: ProfileViewPayload | null) => {
    const setLaneState = lane === 'pals' ? setPals : setMatch;
    
    setLaneState((prev) => {
      const currentId = profile.candidate.user_id;
      const currentProfileId = currentProfile?.candidate.user_id;
      
      // Remove both currentId and currentProfileId from queue to avoid duplicates
      let newQueue = prev.queue.filter((p) => 
        p.candidate.user_id !== currentId && 
        p.candidate.user_id !== currentProfileId
      );
      
      // If there's a current profile, put it at the front (it will be next after the undone profile)
      if (currentProfile) {
        newQueue = [currentProfile, ...newQueue];
      }
      
      // Put the undone profile at the front and reset index to 0
      newQueue = [profile, ...newQueue];
      
      console.log(`[useFeedQueue] undoCard(${lane}): inserted profile, reset index to 0`);
      return { ...prev, queue: newQueue, index: 0 };
    });
  }, []);
  
  // Ensure prefetch: load more if queue is getting low
  const ensurePrefetch = useCallback(
    async (lane: Lane, minBuffer: number = 3) => {
      const state = lane === 'pals' ? pals : match;
      const remaining = state.queue.length - state.index;
      
      // If queue is low, has more, and not loading, fetch more
      if (remaining <= minBuffer && state.hasMore && !state.isLoading && state.cursor) {
        console.log(`[useFeedQueue] ensurePrefetch(${lane}): fetching more (remaining: ${remaining})`);
        await loadFeedPage(lane, state.cursor, true); // Append to queue
      }
    },
    [pals, match, loadFeedPage]
  );
  
  // Reset a lane (clear queue, cursor, index)
  const resetLane = useCallback((lane: Lane) => {
    const setLaneState = lane === 'pals' ? setPals : setMatch;
    setLaneState(INITIAL_LANE_STATE);
    initializedLanesRef.current.delete(lane);
  }, []);
  
  // Initialize active lane on mount (only once per lane)
  useEffect(() => {
    if (!userId || isMountedRef.current) return;
    
    isMountedRef.current = true;
    console.log('[useFeedQueue] Mount: initializing active lane:', activeLane);
    
    // Load initial batch for active lane
    if (!initializedLanesRef.current.has(activeLane)) {
      initializedLanesRef.current.add(activeLane);
      loadFeedPage(activeLane, null, false).catch((error) => {
        console.error(`[useFeedQueue] Failed to initialize ${activeLane}:`, error);
      });
    }
  }, [userId, activeLane, loadFeedPage]);
  
  // Prefetch inactive lane in background (once per lane)
  useEffect(() => {
    if (!userId) return;
    
    const otherLane: Lane = activeLane === 'pals' ? 'match' : 'pals';
    
    // Prefetch other lane if not initialized and not loading
    if (!initializedLanesRef.current.has(otherLane)) {
      const state = otherLane === 'pals' ? pals : match;
      if (!state.isLoading && state.queue.length === 0) {
        console.log(`[useFeedQueue] Prefetching inactive lane: ${otherLane}`);
        initializedLanesRef.current.add(otherLane);
        loadFeedPage(otherLane, null, false).catch((error) => {
          console.error(`[useFeedQueue] Failed to prefetch ${otherLane}:`, error);
        });
      }
    }
  }, [userId, activeLane, pals, match, loadFeedPage]);
  
  return {
    activeLane,
    setActiveLane,
    getActiveState,
    pals,
    match,
    advanceCard,
    ensurePrefetch,
    loadFeedPage,
    resetLane,
    getCurrentCard,
    undoCard,
  };
}