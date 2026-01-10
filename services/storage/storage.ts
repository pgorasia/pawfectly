/**
 * Storage wrapper that safely handles both Expo Go and production builds.
 * 
 * In Expo Go: Uses AsyncStorage (React Native's async key-value storage)
 * In Production: Uses MMKV (fast synchronous key-value storage)
 * 
 * IMPORTANT: MMKV must ONLY be required when NOT in Expo Go, as Expo Go
 * cannot load native modules like react-native-mmkv.
 */

import Constants from 'expo-constants';

// Type definitions for unified storage interface
interface StorageAdapter {
  getString: (key: string) => string | undefined | Promise<string | null>;
  set: (key: string, value: string) => void | Promise<void>;
  delete: (key: string) => void | Promise<void>;
  clearAll?: () => void | Promise<void>;
}

let storage: StorageAdapter;

// Detect if running in Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

if (isExpoGo) {
  // Expo Go: Use AsyncStorage (async API)
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  
  storage = {
    getString: async (key: string) => {
      try {
        return await AsyncStorage.getItem(key);
      } catch (error) {
        console.error('[Storage] AsyncStorage getString error:', error);
        return null;
      }
    },
    set: async (key: string, value: string) => {
      try {
        await AsyncStorage.setItem(key, value);
      } catch (error) {
        console.error('[Storage] AsyncStorage set error:', error);
      }
    },
    delete: async (key: string) => {
      try {
        await AsyncStorage.removeItem(key);
      } catch (error) {
        console.error('[Storage] AsyncStorage delete error:', error);
      }
    },
    clearAll: async () => {
      try {
        await AsyncStorage.clear();
      } catch (error) {
        console.error('[Storage] AsyncStorage clearAll error:', error);
      }
    },
  };
} else {
  // Production: Use MMKV (sync API)
  const { MMKV } = require('react-native-mmkv');
  const mmkvInstance = new MMKV();
  
  storage = {
    getString: (key: string) => {
      try {
        return mmkvInstance.getString(key);
      } catch (error) {
        console.error('[Storage] MMKV getString error:', error);
        return undefined;
      }
    },
    set: (key: string, value: string) => {
      try {
        mmkvInstance.set(key, value);
      } catch (error) {
        console.error('[Storage] MMKV set error:', error);
      }
    },
    delete: (key: string) => {
      try {
        mmkvInstance.delete(key);
      } catch (error) {
        console.error('[Storage] MMKV delete error:', error);
      }
    },
    clearAll: () => {
      try {
        mmkvInstance.clearAll();
      } catch (error) {
        console.error('[Storage] MMKV clearAll error:', error);
      }
    },
  };
}

// Export a unified storage interface
// Note: When using AsyncStorage, getString/set/delete return Promises
// When using MMKV, they are synchronous
// Consumers should handle both cases with optional await
export default storage;

// Export helper to check if running in Expo Go
export const isRunningInExpoGo = isExpoGo;
