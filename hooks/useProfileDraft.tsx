import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import {
  dbDogToDogProfile,
  dbProfileToHumanProfile,
  dbPreferencesToDraftPreferences,
} from '@/services/supabase/onboardingService';

export type AgeGroup = 'puppy' | 'young' | 'adult' | 'senior';
export type DogSize = 'small' | 'medium' | 'large';
export type EnergyLevel = 'low' | 'medium' | 'high';
export type PlayStyle = 'fetch' | 'tug' | 'chase' | 'wrestle' | 'gentle' | 'rough';
export type Temperament = 'calm' | 'playful' | 'reactive';
export type Gender = 'male' | 'female' | 'trans' | 'non-binary' | 'prefer-not-to-say' | 'any';
export type ConnectionStyle = 'pawsome-pals' | 'pawfect-match';

export interface DogPrompt {
  prompt_question_id: string;
  answer_text: string;
  display_order: number; // 1 or 2
}

export interface DogProfile {
  id: string;
  slot: number; // 1, 2, or 3 - stable slot identifier
  name: string;
  ageGroup: AgeGroup | null;
  breed: string;
  size: DogSize | null;
  energy: EnergyLevel | null;
  playStyles: PlayStyle[];
  temperament: Temperament | null;
  prompts?: DogPrompt[]; // Up to 2 prompts per dog
}

export interface HumanProfile {
  name: string;
  dateOfBirth: string; // mm/dd/yyyy format
  gender: Gender | null;
}

export interface Location {
  city?: string;
  latitude?: number;
  longitude?: number;
  useCurrentLocation: boolean;
}

export interface Preferences {
  preferredGenders: Gender[];
  ageRange: {
    min: number | null;
    max: number | null;
  };
  distance: number; // in miles/km
}

export interface ProfileDraft {
  dogs: DogProfile[];
  human: HumanProfile;
  location: Location | null;
  connectionStyles: ConnectionStyle[];
  preferences: {
    'pawsome-pals': Preferences | null;
    'pawfect-match': Preferences | null;
  };
}

interface ProfileDraftContextType {
  draft: ProfileDraft;
  draftHydrated: boolean;
  updateDogs: (dogs: DogProfile[]) => void;
  addDog: (dog: DogProfile) => void;
  updateDog: (id: string, updates: Partial<DogProfile>) => void;
  updateHuman: (updates: Partial<HumanProfile>) => void;
  updateLocation: (location: Location) => void;
  updateConnectionStyles: (styles: ConnectionStyle[]) => void;
  updatePreferences: (style: ConnectionStyle, preferences: Preferences) => void;
  loadFromDatabase: (data: {
    profile: any;
    dogs: any[];
    preferences: any;
  }) => void;
  reset: () => void;
}

const defaultDraft: ProfileDraft = {
  dogs: [],
  human: {
    name: '',
    dateOfBirth: '',
    gender: null,
  },
  location: null,
  connectionStyles: [],
  preferences: {
    'pawsome-pals': null,
    'pawfect-match': null,
  },
};

const ProfileDraftContext = createContext<ProfileDraftContextType | undefined>(undefined);

export const ProfileDraftProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [draft, setDraft] = useState<ProfileDraft>(defaultDraft);
  const [draftHydrated, setDraftHydrated] = useState(false);

  const updateDogs = useCallback((dogs: DogProfile[]) => {
    setDraft((prev) => ({ ...prev, dogs }));
  }, []);

  const addDog = useCallback((dog: DogProfile) => {
    setDraft((prev) => {
      // Assign lowest available slot (1-3) not used by existing dogs
      const usedSlots = prev.dogs.map(d => d.slot).filter(s => s >= 1 && s <= 3);
      let newSlot = 1;
      for (let i = 1; i <= 3; i++) {
        if (!usedSlots.includes(i)) {
          newSlot = i;
          break;
        }
      }
      const dogWithSlot = { ...dog, slot: newSlot };
      return { ...prev, dogs: [...prev.dogs, dogWithSlot] };
    });
  }, []);

  const updateDog = useCallback((id: string, updates: Partial<DogProfile>) => {
    setDraft((prev) => ({
      ...prev,
      dogs: prev.dogs.map((dog) => (dog.id === id ? { ...dog, ...updates } : dog)),
    }));
  }, []);

  const updateHuman = useCallback((updates: Partial<HumanProfile>) => {
    setDraft((prev) => ({
      ...prev,
      human: { ...prev.human, ...updates },
    }));
  }, []);

  const updateLocation = useCallback((location: Location) => {
    setDraft((prev) => ({ ...prev, location }));
  }, []);

  const updateConnectionStyles = useCallback((styles: ConnectionStyle[]) => {
    setDraft((prev) => ({ ...prev, connectionStyles: styles }));
  }, []);

  const updatePreferences = useCallback((style: ConnectionStyle, preferences: Preferences) => {
    setDraft((prev) => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        [style]: preferences,
      },
    }));
  }, []);

  const loadFromDatabase = useCallback((data: {
    profile: any;
    dogs: any[];
    preferences: any;
  }) => {
    const newDraft: ProfileDraft = { ...defaultDraft };

    // Load profile data
    if (data.profile) {
      newDraft.human = dbProfileToHumanProfile(data.profile);
      if (data.profile.city || data.profile.latitude || data.profile.longitude) {
        newDraft.location = {
          city: data.profile.city || '',
          latitude: data.profile.latitude || undefined,
          longitude: data.profile.longitude || undefined,
          useCurrentLocation: !!(data.profile.latitude && data.profile.longitude),
        };
      }
    }

    // Load dogs
    if (data.dogs && data.dogs.length > 0) {
      newDraft.dogs = data.dogs.map((dbDog: any) => {
        // Prompts are stored in a separate table and may be attached to the dog payload
        // by the bootstrap layer as `_prompts` (preferred) or `prompts`.
        const prompts = (dbDog?._prompts ?? dbDog?.prompts) as
          | Array<{ prompt_question_id: string; answer_text: string; display_order: number }>
          | undefined;

        const normalizedPrompts = Array.isArray(prompts) && prompts.length > 0 ? prompts : undefined;
        // Passing the full dbDog object is safe; dbDogToDogProfile only reads known columns.
        return dbDogToDogProfile(dbDog, normalizedPrompts);
      });
    }

    // Load preferences
    if (data.preferences) {
      const { connectionStyles, preferences: prefs } = dbPreferencesToDraftPreferences(data.preferences);
      newDraft.connectionStyles = connectionStyles;
      newDraft.preferences = prefs;
    }

    setDraft(newDraft);
    setDraftHydrated(true);
  }, []);

  const reset = useCallback(() => {
    setDraft(defaultDraft);
    setDraftHydrated(false);
  }, []);

  const ctxValue: ProfileDraftContextType = useMemo(
    () => ({
      draft,
      draftHydrated,
      updateDogs,
      addDog,
      updateDog,
      updateHuman,
      updateLocation,
      updateConnectionStyles,
      updatePreferences,
      loadFromDatabase,
      reset,
    }),
    [
      draft,
      draftHydrated,
      updateDogs,
      addDog,
      updateDog,
      updateHuman,
      updateLocation,
      updateConnectionStyles,
      updatePreferences,
      loadFromDatabase,
      reset,
    ]
  );

  return (
    <ProfileDraftContext.Provider
      value={ctxValue}
    >
      {children}
    </ProfileDraftContext.Provider>
  );
};

export const useProfileDraft = () => {
  const context = useContext(ProfileDraftContext);
  if (!context) {
    throw new Error('useProfileDraft must be used within ProfileDraftProvider');
  }
  return context;
};

