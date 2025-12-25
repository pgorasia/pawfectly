import React, { createContext, useContext, useState, ReactNode } from 'react';

export type AgeGroup = 'puppy' | 'young' | 'adult' | 'senior';
export type DogSize = 'small' | 'medium' | 'large';
export type EnergyLevel = 'low' | 'medium' | 'high';
export type PlayStyle = 'fetch' | 'tug' | 'chase' | 'wrestle' | 'gentle' | 'rough';
export type Temperament = 'calm' | 'playful' | 'reactive';
export type Gender = 'male' | 'female' | 'trans' | 'non-binary' | 'self-described' | 'prefer-not-to-say' | 'any';
export type ConnectionStyle = 'pawsome-pals' | 'pawfect-match';

export interface DogProfile {
  id: string;
  name: string;
  ageGroup: AgeGroup | null;
  breed: string;
  size: DogSize | null;
  energy: EnergyLevel | null;
  playStyles: PlayStyle[];
  temperament: Temperament | null;
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
  updateDogs: (dogs: DogProfile[]) => void;
  addDog: (dog: DogProfile) => void;
  updateDog: (id: string, updates: Partial<DogProfile>) => void;
  updateHuman: (updates: Partial<HumanProfile>) => void;
  updateLocation: (location: Location) => void;
  updateConnectionStyles: (styles: ConnectionStyle[]) => void;
  updatePreferences: (style: ConnectionStyle, preferences: Preferences) => void;
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

  const updateDogs = (dogs: DogProfile[]) => {
    setDraft((prev) => ({ ...prev, dogs }));
  };

  const addDog = (dog: DogProfile) => {
    setDraft((prev) => ({ ...prev, dogs: [...prev.dogs, dog] }));
  };

  const updateDog = (id: string, updates: Partial<DogProfile>) => {
    setDraft((prev) => ({
      ...prev,
      dogs: prev.dogs.map((dog) => (dog.id === id ? { ...dog, ...updates } : dog)),
    }));
  };

  const updateHuman = (updates: Partial<HumanProfile>) => {
    setDraft((prev) => ({
      ...prev,
      human: { ...prev.human, ...updates },
    }));
  };

  const updateLocation = (location: Location) => {
    setDraft((prev) => ({ ...prev, location }));
  };

  const updateConnectionStyles = (styles: ConnectionStyle[]) => {
    setDraft((prev) => ({ ...prev, connectionStyles: styles }));
  };

  const updatePreferences = (style: ConnectionStyle, preferences: Preferences) => {
    setDraft((prev) => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        [style]: preferences,
      },
    }));
  };

  const reset = () => {
    setDraft(defaultDraft);
  };

  return (
    <ProfileDraftContext.Provider
      value={{
        draft,
        updateDogs,
        addDog,
        updateDog,
        updateHuman,
        updateLocation,
        updateConnectionStyles,
        updatePreferences,
        reset,
      }}
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

