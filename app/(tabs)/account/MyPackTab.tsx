import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { useProfileDraft, DogProfile, AgeGroup, DogSize, EnergyLevel, PlayStyle, Temperament } from '@/hooks/useProfileDraft';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { deletePhotosByDogSlot } from '@/services/supabase/photoService';
import { updateProfileData } from '@/services/supabase/onboardingService';
import { searchLocation } from '@/services/geocoding/locationService';

const AGE_GROUPS: { label: string; value: AgeGroup }[] = [
  { label: 'Puppy (0-1 year)', value: 'puppy' },
  { label: 'Young (1-3 years)', value: 'young' },
  { label: 'Adult (3-8 years)', value: 'adult' },
  { label: 'Senior (8+ years)', value: 'senior' },
];

const SIZES: { label: string; value: DogSize }[] = [
  { label: 'Small', value: 'small' },
  { label: 'Medium', value: 'medium' },
  { label: 'Large', value: 'large' },
];

const ENERGY_LEVELS: { label: string; value: EnergyLevel }[] = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
];

const PLAY_STYLES: { label: string; value: PlayStyle }[] = [
  { label: 'Fetch', value: 'fetch' },
  { label: 'Tug', value: 'tug' },
  { label: 'Chase', value: 'chase' },
  { label: 'Wrestle', value: 'wrestle' },
  { label: 'Gentle', value: 'gentle' },
  { label: 'Rough', value: 'rough' },
];

const TEMPERAMENTS: { label: string; value: Temperament }[] = [
  { label: 'Calm', value: 'calm' },
  { label: 'Playful', value: 'playful' },
  { label: 'Reactive', value: 'reactive' },
];

const BREEDS = [
  'Labrador Retriever',
  'Golden Retriever',
  'German Shepherd',
  'French Bulldog',
  'Bulldog',
  'Poodle',
  'Beagle',
  'Rottweiler',
  'Yorkshire Terrier',
  'Dachshund',
  'Siberian Husky',
  'Boxer',
  'Great Dane',
  'Shih Tzu',
  'Border Collie',
  'Australian Shepherd',
  'Cocker Spaniel',
  'Chihuahua',
  'Pomeranian',
  'Maltese',
  'Boston Terrier',
  'Havanese',
  'Bernese Mountain Dog',
  'Cavalier King Charles Spaniel',
  'English Springer Spaniel',
  'Labradoodle',
  'Goldendoodle',
  'Cockapoo',
  'Maltipoo',
  'Puggle',
  'Schnoodle',
  'Yorkipoo',
  'Cavapoo',
  'Bernedoodle',
  'Aussiedoodle',
  'Sheepadoodle',
  'Pomsky',
  'Chiweenie',
  'Pomchi',
  'Shihpoo',
  'Other',
];

const MAX_DOGS = 3;

function DogForm({
  dog,
  onUpdate,
  onRemove,
  canRemove,
}: {
  dog: DogProfile;
  onUpdate: (updates: Partial<DogProfile>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [showBreedModal, setShowBreedModal] = useState(false);
  const [breedSearch, setBreedSearch] = useState('');

  const filteredBreeds = BREEDS.filter((breed) =>
    breed.toLowerCase().includes(breedSearch.toLowerCase())
  );

  const togglePlayStyle = (style: PlayStyle) => {
    const current = dog.playStyles || [];
    if (current.includes(style)) {
      onUpdate({ playStyles: current.filter((s) => s !== style) });
    } else if (current.length < 3) {
      onUpdate({ playStyles: [...current, style] });
    }
  };

  const selectTemperament = (temp: Temperament) => {
    onUpdate({ temperament: temp });
  };

  const selectBreed = (breed: string) => {
    onUpdate({ breed });
    setShowBreedModal(false);
    setBreedSearch('');
  };

  return (
    <Card style={styles.dogCard}>
      <View style={styles.dogHeader}>
        <AppText variant="heading" style={styles.dogTitle}>
          {dog.name || 'New Dog'}
        </AppText>
        {canRemove && (
          <TouchableOpacity onPress={onRemove} style={styles.removeButton}>
            <AppText variant="caption" color={Colors.accent}>
              Remove
            </AppText>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.field}>
        <AppText variant="body" style={styles.label}>
          Name *
        </AppText>
        <TextInput
          style={styles.input}
          value={dog.name}
          onChangeText={(text) => onUpdate({ name: text })}
          placeholder="Enter dog's name"
        />
      </View>

      <View style={styles.field}>
        <AppText variant="body" style={styles.label}>
          Age Group *
        </AppText>
        <View style={styles.optionsRow}>
          {AGE_GROUPS.map((group) => (
            <TouchableOpacity
              key={group.value}
              style={[
                styles.optionButton,
                dog.ageGroup === group.value && styles.optionButtonSelected,
              ]}
              onPress={() => onUpdate({ ageGroup: group.value })}
            >
              <AppText
                variant="caption"
                color={dog.ageGroup === group.value ? 'background' : 'text'}
              >
                {group.label}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <AppText variant="body" style={styles.label}>
          Breed *
        </AppText>
        <TouchableOpacity
          style={styles.input}
          onPress={() => setShowBreedModal(true)}
        >
          <AppText
            variant="body"
            color={dog.breed ? 'text' : Colors.text}
            style={!dog.breed && styles.placeholder}
          >
            {dog.breed || 'Select breed'}
          </AppText>
        </TouchableOpacity>
        <Modal
          visible={showBreedModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowBreedModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <AppText variant="heading">Select Breed</AppText>
                <TouchableOpacity onPress={() => setShowBreedModal(false)}>
                  <AppText variant="body" color={Colors.primary}>Close</AppText>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.searchInput}
                placeholder="Search breeds..."
                value={breedSearch}
                onChangeText={setBreedSearch}
              />
              <ScrollView style={styles.breedList}>
                {filteredBreeds.map((breed) => (
                  <TouchableOpacity
                    key={breed}
                    style={[
                      styles.breedItem,
                      dog.breed === breed && styles.breedItemSelected,
                    ]}
                    onPress={() => selectBreed(breed)}
                  >
                    <AppText
                      variant="body"
                      color={dog.breed === breed ? 'background' : 'text'}
                    >
                      {breed}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>

      <View style={styles.field}>
        <AppText variant="body" style={styles.label}>
          Size *
        </AppText>
        <View style={styles.optionsRow}>
          {SIZES.map((size) => (
            <TouchableOpacity
              key={size.value}
              style={[
                styles.optionButton,
                dog.size === size.value && styles.optionButtonSelected,
              ]}
              onPress={() => onUpdate({ size: size.value })}
            >
              <AppText
                variant="caption"
                color={dog.size === size.value ? 'background' : 'text'}
              >
                {size.label}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <AppText variant="body" style={styles.label}>
          Energy Level *
        </AppText>
        <View style={styles.optionsRow}>
          {ENERGY_LEVELS.map((level) => (
            <TouchableOpacity
              key={level.value}
              style={[
                styles.optionButton,
                dog.energy === level.value && styles.optionButtonSelected,
              ]}
              onPress={() => onUpdate({ energy: level.value })}
            >
              <AppText
                variant="caption"
                color={dog.energy === level.value ? 'background' : 'text'}
              >
                {level.label}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <AppText variant="body" style={styles.label}>
          Play Styles (select up to 3) *
        </AppText>
        <AppText variant="caption" style={styles.hint}>
          {dog.playStyles?.length || 0} of 3 selected
        </AppText>
        <View style={styles.playStylesGrid}>
          {PLAY_STYLES.map((style) => {
            const isSelected = dog.playStyles?.includes(style.value) || false;
            const isDisabled = !isSelected && (dog.playStyles?.length || 0) >= 3;
            return (
              <TouchableOpacity
                key={style.value}
                style={[
                  styles.playStyleButton,
                  isSelected && styles.playStyleButtonSelected,
                  isDisabled && styles.playStyleButtonDisabled,
                ]}
                onPress={() => togglePlayStyle(style.value)}
                disabled={isDisabled}
              >
                <AppText
                  variant="caption"
                  color={isSelected ? 'background' : 'text'}
                  style={isDisabled && styles.disabledText}
                >
                  {style.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.field}>
        <AppText variant="body" style={styles.label}>
          Temperament *
        </AppText>
        <View style={styles.optionsRow}>
          {TEMPERAMENTS.map((temp) => (
            <TouchableOpacity
              key={temp.value}
              style={[
                styles.optionButton,
                dog.temperament === temp.value && styles.optionButtonSelected,
              ]}
              onPress={() => selectTemperament(temp.value)}
            >
              <AppText
                variant="caption"
                color={dog.temperament === temp.value ? 'background' : 'text'}
              >
                {temp.label}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Card>
  );
}

export default function MyPackTab() {
  const { user } = useAuth();
  const { draft, updateDogs, updateHuman, updateLocation } = useProfileDraft();
  const [dogs, setDogs] = useState<DogProfile[]>(
    draft.dogs.length > 0
      ? draft.dogs.slice(0, MAX_DOGS).map((dog, index) => ({
          ...dog,
          slot: dog.slot || (index + 1),
        }))
      : []
  );
  const [name, setName] = useState(draft.human.name || '');
  const [city, setCity] = useState(draft.location?.city || '');
  const [citySuggestions, setCitySuggestions] = useState<{ name: string; fullAddress: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [locationFromGPS, setLocationFromGPS] = useState(draft.location?.useCurrentLocation || false);

  // Autosave debounce timer
  const autosaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Load initial data
  useEffect(() => {
    if (draft.dogs.length > 0) {
      setDogs(draft.dogs.slice(0, MAX_DOGS).map((dog, index) => ({
        ...dog,
        slot: dog.slot || (index + 1),
      })));
    }
    setName(draft.human.name || '');
    setCity(draft.location?.city || '');
    setLocationFromGPS(draft.location?.useCurrentLocation || false);
  }, [draft]);

  // Autosave function
  const autosave = useCallback(async () => {
    if (!user?.id) return;

    try {
      updateDogs(dogs);
      updateHuman({ name });
      updateLocation({
        useCurrentLocation: locationFromGPS,
        city: city.trim(),
        latitude: locationFromGPS ? draft.location?.latitude : undefined,
        longitude: locationFromGPS ? draft.location?.longitude : undefined,
      });

      await updateProfileData(
        user.id,
        dogs,
        { name, dateOfBirth: draft.human.dateOfBirth, gender: draft.human.gender },
        {
          useCurrentLocation: locationFromGPS,
          city: city.trim(),
          latitude: locationFromGPS ? draft.location?.latitude : undefined,
          longitude: locationFromGPS ? draft.location?.longitude : undefined,
        }
      );
    } catch (error) {
      console.error('[MyPackTab] Failed to autosave:', error);
    }
  }, [user, dogs, name, city, locationFromGPS, draft, updateDogs, updateHuman, updateLocation]);

  // Debounced autosave
  useEffect(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      autosave();
    }, 1000); // Save after 1 second of no changes

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [dogs, name, city, locationFromGPS]);

  const handleAddDog = () => {
    if (dogs.length >= MAX_DOGS) return;
    
    const usedSlots = dogs.map(d => d.slot).filter(s => s >= 1 && s <= 3);
    let newSlot = 1;
    for (let i = 1; i <= 3; i++) {
      if (!usedSlots.includes(i)) {
        newSlot = i;
        break;
      }
    }
    
    const newDog: DogProfile = {
      id: `dog-${Date.now()}`,
      slot: newSlot,
      name: '',
      ageGroup: null,
      breed: '',
      size: null,
      energy: null,
      playStyles: [],
      temperament: null,
    };
    setDogs([...dogs, newDog]);
  };

  const handleRemoveDog = async (id: string) => {
    const dogToRemove = dogs.find((dog) => dog.id === id);
    if (!dogToRemove) return;

    if (user?.id && dogToRemove.slot) {
      try {
        await deletePhotosByDogSlot(user.id, dogToRemove.slot);
      } catch (error) {
        console.error('Failed to delete photos for dog slot:', error);
      }
    }

    setDogs(dogs.filter((dog) => dog.id !== id));
  };

  const handleUpdateDog = (id: string, updates: Partial<DogProfile>) => {
    setDogs(dogs.map((dog) => (dog.id === id ? { ...dog, ...updates } : dog)));
  };

  const handleCityChange = async (text: string) => {
    setCity(text);
    setLocationFromGPS(false);
    
    if (text.trim().length < 2) {
      setCitySuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchLocation(text);
      setCitySuggestions(results);
      setShowSuggestions(results.length > 0);
    } catch (error) {
      console.error('Error fetching city suggestions:', error);
      setCitySuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsSearching(false);
    }
  };

  const selectCity = (selectedCity: { name: string; fullAddress: string }) => {
    setCity(selectedCity.fullAddress);
    setShowSuggestions(false);
  };

  const handleUseCurrentLocation = () => {
    const detectedCity = 'San Francisco, CA'; // This would come from reverse geocoding
    setCity(detectedCity);
    setLocationFromGPS(true);
    setShowSuggestions(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <AppText variant="heading" style={styles.sectionTitle}>
            Your Pack
          </AppText>
          {dogs.map((dog) => (
            <DogForm
              key={dog.id}
              dog={dog}
              onUpdate={(updates) => handleUpdateDog(dog.id, updates)}
              onRemove={() => handleRemoveDog(dog.id)}
              canRemove={dogs.length > 1}
            />
          ))}
          {dogs.length < MAX_DOGS && (
            <TouchableOpacity 
              onPress={handleAddDog} 
              style={styles.addButton}
            >
              <AppText 
                variant="body" 
                color={Colors.primary}
              >
                + Add another dog
              </AppText>
            </TouchableOpacity>
          )}
          {dogs.length >= MAX_DOGS && (
            <AppText variant="caption" style={styles.helperText}>
              You can add up to 3 dogs right now.
            </AppText>
          )}
        </View>

        <View style={styles.section}>
          <AppText variant="heading" style={styles.sectionTitle}>
            Little about yourself
          </AppText>

          <View style={styles.field}>
            <AppText variant="body" style={styles.label}>
              Name *
            </AppText>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Enter your name"
            />
          </View>

          <View style={styles.field}>
            <AppText variant="body" style={styles.label}>
              Date of Birth
            </AppText>
            <View style={[styles.input, styles.disabledInput]}>
              <AppText variant="body" style={styles.disabledText}>
                {draft.human.dateOfBirth || 'Not set'}
              </AppText>
            </View>
            <AppText variant="caption" style={styles.hint}>
              Date of birth cannot be changed
            </AppText>
          </View>

          <View style={styles.field}>
            <AppText variant="body" style={styles.label}>
              Gender
            </AppText>
            <View style={[styles.input, styles.disabledInput]}>
              <AppText variant="body" style={styles.disabledText}>
                {draft.human.gender 
                  ? draft.human.gender.charAt(0).toUpperCase() + draft.human.gender.slice(1).replace(/-/g, ' ')
                  : 'Not set'}
              </AppText>
            </View>
            <AppText variant="caption" style={styles.hint}>
              Gender cannot be changed
            </AppText>
          </View>

          <View style={styles.field}>
            <AppText variant="body" style={styles.label}>
              City or Zip Code
            </AppText>
            <View style={styles.cityInputRow}>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  value={city}
                  onChangeText={handleCityChange}
                  placeholder="Enter city name or zip code"
                  onFocus={() => {
                    if (citySuggestions.length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                />
                {isSearching && (
                  <View style={styles.searchingIndicator}>
                    <AppText variant="caption" style={styles.searchingText}>
                      Searching...
                    </AppText>
                  </View>
                )}
                {showSuggestions && citySuggestions.length > 0 && (
                  <View style={styles.suggestionsContainer}>
                    {citySuggestions.map((suggestion, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.suggestionItem}
                        onPress={() => selectCity(suggestion)}
                      >
                        <AppText variant="body">{suggestion.fullAddress}</AppText>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <TouchableOpacity
                style={styles.gpsButton}
                onPress={handleUseCurrentLocation}
              >
                <MaterialIcons name="my-location" size={24} color={Colors.primary} />
              </TouchableOpacity>
            </View>
            <AppText variant="caption" style={styles.privacyNote}>
              We'll never show your exact location.
            </AppText>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  dogCard: {
    marginBottom: Spacing.md,
  },
  dogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  dogTitle: {
    flex: 1,
  },
  removeButton: {
    padding: Spacing.sm,
  },
  field: {
    marginBottom: Spacing.lg,
  },
  label: {
    marginBottom: Spacing.sm,
    fontWeight: '600',
  },
  hint: {
    marginTop: Spacing.xs,
    opacity: 0.6,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.text,
    borderRadius: 8,
    padding: Spacing.md,
    fontSize: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  disabledInput: {
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderColor: 'rgba(31, 41, 55, 0.2)',
  },
  disabledText: {
    opacity: 0.6,
  },
  placeholder: {
    opacity: 0.5,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  optionButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.text,
    backgroundColor: 'transparent',
  },
  optionButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  playStylesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  playStyleButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.text,
    backgroundColor: 'transparent',
  },
  playStyleButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  playStyleButtonDisabled: {
    opacity: 0.3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: Colors.text,
    borderRadius: 8,
    padding: Spacing.md,
    fontSize: 16,
    marginBottom: Spacing.md,
  },
  breedList: {
    maxHeight: 400,
  },
  breedItem: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.text,
    opacity: 0.5,
  },
  breedItemSelected: {
    backgroundColor: Colors.primary,
    opacity: 1,
    borderBottomColor: Colors.primary,
  },
  addButton: {
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  helperText: {
    textAlign: 'center',
    marginTop: Spacing.sm,
    opacity: 0.7,
  },
  cityInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  inputWrapper: {
    flex: 1,
    position: 'relative',
  },
  gpsButton: {
    padding: Spacing.md,
    marginTop: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.text,
    borderRadius: 8,
    marginTop: Spacing.xs,
    maxHeight: 200,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  suggestionItem: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.text,
    opacity: 0.5,
  },
  searchingIndicator: {
    padding: Spacing.sm,
    alignItems: 'center',
  },
  searchingText: {
    opacity: 0.6,
    fontStyle: 'italic',
  },
  privacyNote: {
    marginTop: Spacing.xs,
    opacity: 0.7,
  },
});

