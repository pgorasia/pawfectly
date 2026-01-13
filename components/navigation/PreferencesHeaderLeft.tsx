import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

export function PreferencesHeaderLeft() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  
  const handleBack = () => {
    if (params.from === 'account') {
      router.replace('/(tabs)/account');
    } else if (params.from === 'feed') {
      router.replace('/(tabs)');
    } else {
      // Default to account if no from parameter
      router.replace('/(tabs)/account');
    }
  };
  
  return (
    <Pressable onPress={handleBack} hitSlop={10} style={styles.container}>
      <MaterialIcons name="chevron-left" size={28} color={Colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
