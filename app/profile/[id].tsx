/**
 * Profile View Screen
 * Displays full profile for a candidate (from Liked You or other sources)
 * Handles accept/reject/skip actions
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { FullProfileView } from '@/components/profile/FullProfileView';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { getProfileView, submitSwipe } from '@/services/feed/feedService';
import { supabase } from '@/services/supabase/supabaseClient';
import type { ProfileViewPayload } from '@/types/feed';
import { useAuth } from '@/contexts/AuthContext';
import { TouchableOpacity } from 'react-native-gesture-handler';

type DislikeAction = 'reject' | 'skip';

type DislikeEvent = {
  eventId: string;
  targetId: string;
  lane: 'pals' | 'match';
  action: DislikeAction;
  createdAtMs: number;
  commitAfterMs: number;
  crossLaneDays?: number;
  skipDays?: number;
  snapshot: ProfileViewPayload;
};

export default function ProfileViewScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { id, source, lane } = useLocalSearchParams<{ id: string; source?: string; lane?: string }>();
  
  // Determine lane from URL params or default to 'match'
  const activeLane = (lane === 'pals' || lane === 'match') ? lane : 'match';
  
  const [profile, setProfile] = useState<ProfileViewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Load profile
  useEffect(() => {
    if (!id) return;

    const loadProfile = async () => {
      try {
        setLoading(true);
        const data = await getProfileView(id);
        setProfile(data);
      } catch (error) {
        console.error('[ProfileViewScreen] Failed to load profile:', error);
        Alert.alert('Error', 'Failed to load profile');
        router.back();
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [id]);

  // Handle accept action
  const handleAccept = useCallback(async () => {
    if (!profile || actionInProgress) return;

    setActionInProgress(true);
    try {
      const result = await submitSwipe(profile.candidate.user_id, 'accept', activeLane);

      if (result.ok) {
        // Success - navigate back
        Alert.alert('Success', 'You liked this profile!', [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]);
      } else if (result.error === 'daily_limit_reached') {
        Alert.alert('Daily Limit Reached', 'Upgrade to premium for unlimited likes');
      }
    } catch (error) {
      console.error('[ProfileViewScreen] Failed to accept:', error);
      Alert.alert('Error', 'Failed to like profile. Please try again.');
    } finally {
      setActionInProgress(false);
    }
  }, [profile, actionInProgress, router, activeLane]);

  // Handle reject/skip action (with outbox, no undo)
  const handleDislike = useCallback(async (action: 'reject' | 'skip') => {
    if (!profile || actionInProgress) return;

    setActionInProgress(true);
    try {
      const now = Date.now();
      const eventId = Crypto.randomUUID();

      const event: DislikeEvent = {
        eventId,
        targetId: profile.candidate.user_id,
        lane: activeLane,
        action,
        createdAtMs: now,
        commitAfterMs: now, // Commit immediately (no undo)
        ...(action === 'reject' ? { crossLaneDays: 30 } : { skipDays: 7 }),
        snapshot: profile,
      };

      // Submit immediately to database (no undo grace period)
      const payload = {
        client_event_id: event.eventId,
        target_id: event.targetId,
        lane: event.lane,
        action: event.action,
        cross_lane_days: event.crossLaneDays ?? 30,
        skip_days: event.skipDays ?? 7,
      };

      const { error } = await supabase.rpc('submit_dislike_batch', {
        p_events: [payload],
      });

      if (error) {
        throw new Error(error.message);
      }

      // Success - navigate back
      router.back();
    } catch (error) {
      console.error('[ProfileViewScreen] Failed to dislike:', error);
      Alert.alert('Error', 'Failed to process action. Please try again.');
      setActionInProgress(false);
    }
  }, [profile, actionInProgress, router, activeLane]);

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <AppText variant="body" style={styles.loadingText}>
            Loading profile...
          </AppText>
        </View>
      </ScreenContainer>
    );
  }

  if (!profile) {
    return (
      <ScreenContainer>
        <View style={styles.errorContainer}>
          <AppText variant="heading">Profile Not Found</AppText>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <FullProfileView
            payload={profile}
            onHeartPress={() => {
              // Heart press from photo/prompt - handle accept
              handleAccept();
            }}
          />
        </ScrollView>

        {/* Fixed Action Bar */}
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton]}
            onPress={() => handleDislike('reject')}
            disabled={actionInProgress}
            activeOpacity={0.7}
          >
            <MaterialIcons name="close" size={28} color={Colors.error} />
            <AppText variant="caption" style={styles.actionLabel}>
              Pass
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.skipButton]}
            onPress={() => handleDislike('skip')}
            disabled={actionInProgress}
            activeOpacity={0.7}
          >
            <MaterialIcons name="schedule" size={28} color={Colors.text} />
            <AppText variant="caption" style={styles.actionLabel}>
              Skip
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.acceptButton]}
            onPress={handleAccept}
            disabled={actionInProgress}
            activeOpacity={0.7}
          >
            {actionInProgress ? (
              <ActivityIndicator size="small" color={Colors.background} />
            ) : (
              <>
                <MaterialIcons name="favorite" size={28} color={Colors.background} />
                <AppText variant="caption" style={styles.acceptLabel}>
                  Like
                </AppText>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    opacity: 0.7,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100, // Space for action bar
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: 'rgba(31, 41, 55, 0.1)',
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: 20,
    minHeight: 60,
    gap: 4,
    maxWidth: 100,
  },
  rejectButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.error + '80',
  },
  skipButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.text + '60',
  },
  acceptButton: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.text,
  },
  acceptLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.background,
  },
});
