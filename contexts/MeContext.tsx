/**
 * Me Context - Server-state cache for current user's data
 * 
 * Holds: profile, dogs, preferences, plus minimal photo info
 * Loaded once at login
 * Updated optimistically on edits
 * 
 * This is the source of truth for tabs (Account, Messages, Explore)
 * Draft is used for onboarding/edit forms, initialized from Me
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { DogProfile, ConnectionStyle, Preferences } from '@/hooks/useProfileDraft';
import {
  dbDogToDogProfile,
  dbProfileToHumanProfile,
  dbPreferencesToDraftPreferences,
} from '@/services/supabase/onboardingService';

/**
 * Convert date from database format (YYYY-MM-DD) to display format (mm/dd/yyyy)
 * This is used when loading dates from the database into the MeContext
 */
function convertDbToDisplayDate(dbDate: string | null): string | null {
  if (!dbDate) return null;
  
  const parts = dbDate.split('-');
  if (parts.length !== 3) return dbDate; // Return as-is if not in expected format
  
  const [year, month, day] = parts;
  return `${month}/${day}/${year}`;
}

export interface MeProfile {
  user_id: string;
  display_name: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  dob: string | null; // Date in mm/dd/yyyy format (converted from PostgreSQL date YYYY-MM-DD when loaded)
  gender: string | null;
  lifecycle_status: string;
  validation_status: string;
}

export interface MeData {
  profile: MeProfile | null;
  dogs: DogProfile[];
  connectionStyles: ConnectionStyle[];
  preferences: {
    'pawsome-pals': Preferences | null;
    'pawfect-match': Preferences | null;
  };
  // Raw preference flags from database (used for lane enablement)
  preferencesRaw: {
    pals_enabled: boolean;
    match_enabled: boolean;
  };
  // Minimal photo info (just counts or IDs, not full photo objects)
  photoCounts?: {
    human: number;
    dogs: Record<number, number>; // dog slot -> count
  };
}

interface MeContextType {
  me: MeData;
  meLoaded: boolean;
  updateMe: (updates: Partial<MeData>) => void;
  loadFromDatabase: (data: {
    profile: any;
    dogs: any[];
    preferences: any;
  }) => void;
  reset: () => void;
}

const defaultMe: MeData = {
  profile: null,
  dogs: [],
  connectionStyles: [],
  preferences: {
    'pawsome-pals': null,
    'pawfect-match': null,
  },
  preferencesRaw: {
    pals_enabled: false,
    match_enabled: false,
  },
};

const MeContext = createContext<MeContextType | undefined>(undefined);

export const MeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [me, setMe] = useState<MeData>(defaultMe);
  const [meLoaded, setMeLoaded] = useState(false);

  const updateMe = (updates: Partial<MeData>) => {
    setMe((prev) => ({ ...prev, ...updates }));
  };

  const loadFromDatabase = (data: {
    profile: any;
    dogs: any[];
    preferences: any;
  }) => {
    const newMe: MeData = { ...defaultMe };

    // Load profile
    if (data.profile) {
      newMe.profile = {
        user_id: data.profile.user_id,
        display_name: data.profile.display_name,
        city: data.profile.city,
        latitude: data.profile.latitude,
        longitude: data.profile.longitude,
        dob: convertDbToDisplayDate(data.profile.dob),
        gender: data.profile.gender,
        lifecycle_status: data.profile.lifecycle_status,
        validation_status: data.profile.validation_status,
      };
    }

    // Load dogs (with prompts attached from loadBootstrap)
    if (data.dogs && data.dogs.length > 0) {
      newMe.dogs = data.dogs.map((dbDog: any) => {
        // Extract prompts if attached by loadBootstrap
        const prompts = dbDog._prompts || undefined;
        // Remove _prompts from dbDog before conversion
        const { _prompts, ...dogData } = dbDog;
        return dbDogToDogProfile(dogData, prompts);
      });
    }

    // Load preferences
    if (data.preferences) {
      const { connectionStyles, preferences: prefs } = dbPreferencesToDraftPreferences(data.preferences);
      newMe.connectionStyles = connectionStyles;
      newMe.preferences = prefs;
      // Also store raw preference flags for lane enablement
      newMe.preferencesRaw = {
        pals_enabled: data.preferences.pals_enabled ?? false,
        match_enabled: data.preferences.match_enabled ?? false,
      };
    } else {
      // No preferences yet - keep defaults
      newMe.preferencesRaw = {
        pals_enabled: false,
        match_enabled: false,
      };
    }

    setMe(newMe);
    setMeLoaded(true);
  };

  const reset = () => {
    setMe(defaultMe);
    setMeLoaded(false);
  };

  return (
    <MeContext.Provider
      value={{
        me,
        meLoaded,
        updateMe,
        loadFromDatabase,
        reset,
      }}
    >
      {children}
    </MeContext.Provider>
  );
};

export const useMe = () => {
  const context = useContext(MeContext);
  if (!context) {
    throw new Error('useMe must be used within MeProvider');
  }
  return context;
};

