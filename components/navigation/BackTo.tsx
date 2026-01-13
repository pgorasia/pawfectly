import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

interface BackToProps {
  href: string;
}

export function BackTo({ href }: BackToProps) {
  const router = useRouter();
  
  return (
    <Pressable onPress={() => router.replace(href)} hitSlop={10} style={styles.container}>
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
