import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/contexts/AuthContext';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { getBlockedUsers, unblockUser, type BlockedUser } from '@/services/block/blockService';

export default function BlockedUsersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      loadBlockedUsers();
    }
  }, [user?.id]);

  const loadBlockedUsers = async () => {
    if (!user?.id) return;

    try {
      const users = await getBlockedUsers(user.id);
      setBlockedUsers(users);
    } catch (error) {
      console.error('[BlockedUsersScreen] Failed to load blocked users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = (blockedUser: BlockedUser) => {
    if (!user?.id) return;

    Alert.alert(
      'Unblock User',
      `Are you sure you want to unblock ${blockedUser.display_name || 'this user'}? They will be able to see you in their feed again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'default',
          onPress: async () => {
            try {
              await unblockUser(user.id, blockedUser.blocked_id);
              // Remove from list
              setBlockedUsers(prev => prev.filter(u => u.id !== blockedUser.id));
            } catch (error) {
              console.error('[BlockedUsersScreen] Failed to unblock user:', error);
              Alert.alert('Error', 'Failed to unblock user. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <AppText variant="body" style={styles.backButton}>
              ← Back
            </AppText>
          </TouchableOpacity>
          <AppText variant="heading" style={styles.title}>
            Blocked Users
          </AppText>
        </View>

        {loading ? (
          <AppText variant="body" style={styles.emptyText}>
            Loading...
          </AppText>
        ) : blockedUsers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <AppText variant="body" style={styles.emptyText}>
              No blocked users
            </AppText>
            <AppText variant="caption" style={styles.emptySubtext}>
              Users you block or report will appear here
            </AppText>
          </View>
        ) : (
          <View style={styles.list}>
            {blockedUsers.map((blockedUser) => {
              // Format the date
              const blockedDate = new Date(blockedUser.created_at);
              const formattedDate = blockedDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });
              
              // Determine action text
              const actionText = blockedUser.reason === 'block' ? 'Blocked' : 'Reported';
              
              return (
                <View key={blockedUser.id} style={styles.blockedUserItem}>
                  <View style={styles.userInfo}>
                    <AppText variant="body" style={styles.userName}>
                      {blockedUser.display_name || 'User'}
                    </AppText>
                    {blockedUser.city && (
                      <AppText variant="caption" style={styles.userCity}>
                        {blockedUser.city}
                      </AppText>
                    )}
                    <AppText variant="caption" style={styles.actionText}>
                      {actionText} - blocked on {formattedDate}
                    </AppText>
                  </View>
                  <TouchableOpacity
                    style={styles.unblockButton}
                    onPress={() => handleUnblock(blockedUser)}
                  >
                    <AppText variant="body" style={styles.unblockButtonText}>
                      Unblock
                    </AppText>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  backButton: {
    color: Colors.primary,
    marginBottom: Spacing.md,
  },
  title: {
    marginBottom: Spacing.sm,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    textAlign: 'center',
    marginBottom: Spacing.sm,
    opacity: 0.7,
  },
  emptySubtext: {
    textAlign: 'center',
    opacity: 0.5,
  },
  list: {
    gap: Spacing.md,
  },
  blockedUserItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderRadius: 8,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  userCity: {
    opacity: 0.7,
    marginBottom: Spacing.xs,
  },
  actionText: {
    opacity: 0.6,
    fontStyle: 'italic',
    marginTop: Spacing.xs,
  },
  unblockButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  unblockButtonText: {
    color: Colors.primary,
    fontWeight: '600',
  },
});
