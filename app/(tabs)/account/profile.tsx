import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import MyPackTab from './MyPackTab';
import OurPhotosTab from './OurPhotosTab';

type ProfileTab = 'pack' | 'photos';

export default function AccountProfileScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<ProfileTab>('pack');

  useEffect(() => {
    if (params.tab === 'pack' || params.tab === 'photos') {
      setActiveTab(params.tab);
    }
  }, [params.tab]);

  return (
    <ScreenContainer edges={['bottom']}>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pack' && styles.tabActive]}
          onPress={() => setActiveTab('pack')}
        >
          <AppText
            variant="body"
            style={[styles.tabText, activeTab === 'pack' && styles.tabTextActive]}
          >
            My Pack
          </AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'photos' && styles.tabActive]}
          onPress={() => setActiveTab('photos')}
        >
          <AppText
            variant="body"
            style={[styles.tabText, activeTab === 'photos' && styles.tabTextActive]}
          >
            Our Photos
          </AppText>
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        {activeTab === 'pack' && <MyPackTab onNewDogAdded={() => setActiveTab('photos')} />}
        {activeTab === 'photos' && <OurPhotosTab />}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    opacity: 0.5,
  },
  tabTextActive: {
    opacity: 1,
    fontWeight: '600',
    color: Colors.primary,
  },
  tabContainer: {
    flex: 1,
  },
});

