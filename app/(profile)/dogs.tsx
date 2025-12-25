import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { ProgressBar } from '@/components/common/ProgressBar';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { useProfileDraft, DogProfile, AgeGroup, DogSize, EnergyLevel, PlayStyle, Temperament, Gender } from '@/hooks/useProfileDraft';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';

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

// Popular breeds and cross breeds
const BREEDS = [
  // Popular pure breeds
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
  // Popular cross breeds
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

const GENDERS: { label: string; value: Gender }[] = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Trans', value: 'trans' },
  { label: 'Non-binary', value: 'non-binary' },
  { label: 'Prefer not to say', value: 'prefer-not-to-say' },
];

import { searchLocation } from '@/services/geocoding/locationService';

const MAX_DOGS = 3;

const formatDateInput = (text: string): string => {
  // Remove all non-digits
  const digits = text.replace(/\D/g, '');
  
  // Format as mm/dd/yyyy
  if (digits.length <= 2) {
    return digits;
  } else if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  } else {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
  }
};

const isValidDate = (dateStr: string): boolean => {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return false;
  
  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > new Date().getFullYear()) return false;
  
  const date = new Date(year, month - 1, day);
  return (
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getFullYear() === year
  );
};

const is18Plus = (dateStr: string): boolean => {
  if (!isValidDate(dateStr)) return false;
  
  const parts = dateStr.split('/');
  const birthDate = new Date(
    parseInt(parts[2], 10),
    parseInt(parts[0], 10) - 1,
    parseInt(parts[1], 10)
  );
  
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age >= 18;
};

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

export default function DogsScreen() {
  const router = useRouter();
  const { draft, updateDogs, updateHuman, updateLocation } = useProfileDraft();
  const [dogs, setDogs] = useState<DogProfile[]>(
    draft.dogs.length > 0
      ? draft.dogs.slice(0, MAX_DOGS)
      : [
          {
            id: `dog-${Date.now()}`,
            name: '',
            ageGroup: null,
            breed: '',
            size: null,
            energy: null,
            playStyles: [],
            temperament: null,
          },
        ]
  );
  const [name, setName] = useState(draft.human.name || '');
  const [dateOfBirth, setDateOfBirth] = useState(draft.human.dateOfBirth || '');
  const [gender, setGender] = useState<Gender | null>(draft.human.gender);
  const [dateError, setDateError] = useState('');
  const [showGenderDropdown, setShowGenderDropdown] = useState(false);
  const [city, setCity] = useState(draft.location?.city || '');
  const [citySuggestions, setCitySuggestions] = useState<{ name: string; fullAddress: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [locationFromGPS, setLocationFromGPS] = useState(draft.location?.useCurrentLocation || false);
  const [isSearching, setIsSearching] = useState(false);

  const handleAddDog = () => {
    if (dogs.length >= MAX_DOGS) return;
    
    const newDog: DogProfile = {
      id: `dog-${Date.now()}`,
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

  const handleRemoveDog = (id: string) => {
    setDogs(dogs.filter((dog) => dog.id !== id));
  };

  const handleUpdateDog = (id: string, updates: Partial<DogProfile>) => {
    setDogs(dogs.map((dog) => (dog.id === id ? { ...dog, ...updates } : dog)));
  };

  const handleDateChange = (text: string) => {
    const formatted = formatDateInput(text);
    setDateOfBirth(formatted);
    
    if (formatted.length === 10) {
      if (!isValidDate(formatted)) {
        setDateError('Please enter a valid date');
      } else if (!is18Plus(formatted)) {
        setDateError('You must be 18 or older to use this app');
      } else {
        setDateError('');
      }
    } else {
      setDateError('');
    }
  };

  const handleUseCurrentLocation = () => {
    // Stub: set fake location - in production, this would use actual GPS
    const detectedCity = 'San Francisco, CA'; // This would come from reverse geocoding
    setCity(detectedCity); // Populate the city field
    setLocationFromGPS(true); // Mark as GPS location
    setShowSuggestions(false);
  };

  const handleCityChange = async (text: string) => {
    setCity(text);
    setLocationFromGPS(false); // User typing means it's not from GPS
    
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
    setLocationFromGPS(false); // Selected from list, not GPS
    setShowSuggestions(false);
  };

  const handleContinue = () => {
    if (dateError) return;
    
    updateDogs(dogs);
    updateHuman({
      name,
      dateOfBirth,
      gender,
    });

    // Update location - save city from GPS or manual entry
    const cityToSave = city.trim();
    
    updateLocation({
      useCurrentLocation: locationFromGPS,
      city: cityToSave,
      latitude: locationFromGPS ? 37.7749 : undefined, // Fake SF coordinates - in production, use actual GPS
      longitude: locationFromGPS ? -122.4194 : undefined,
    });

    router.push('/(profile)/photos');
  };

  const dogsValid = dogs.length > 0 && dogs.every((dog) => {
    return (
      dog.name.trim() &&
      dog.ageGroup &&
      dog.breed &&
      dog.size &&
      dog.energy &&
      dog.playStyles.length > 0 &&
      dog.temperament !== null
    );
  });

  const humanValid = 
    name.trim().length > 0 && 
    dateOfBirth.length === 10 && 
    isValidDate(dateOfBirth) &&
    is18Plus(dateOfBirth) &&
    gender !== null &&
    !dateError;

  const locationValid = city.trim().length > 0;

  const canContinue = dogsValid && humanValid && locationValid;

  return (
    <ScreenContainer>
      <ProgressBar
        currentStep={1}
        totalSteps={3}
        stepTitles={['My Pack', 'Photos', 'Preferences']}
      />
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
        <View style={styles.header}>
          <AppText variant="heading" style={styles.title}>
            Your Pack
          </AppText>
        </View>

        <View style={styles.dogsList}>
          {dogs.map((dog) => (
            <DogForm
              key={dog.id}
              dog={dog}
              onUpdate={(updates) => handleUpdateDog(dog.id, updates)}
              onRemove={() => handleRemoveDog(dog.id)}
              canRemove={dogs.length > 1}
            />
          ))}
        </View>

        <View style={styles.addButtonContainer}>
          <TouchableOpacity 
            onPress={handleAddDog} 
            style={[styles.addButton, dogs.length >= MAX_DOGS && styles.addButtonDisabled]}
            disabled={dogs.length >= MAX_DOGS}
          >
            <AppText 
              variant="body" 
              color={dogs.length >= MAX_DOGS ? Colors.text : Colors.primary}
              style={dogs.length >= MAX_DOGS && styles.addButtonTextDisabled}
            >
              + Add another dog
            </AppText>
          </TouchableOpacity>
          {dogs.length >= MAX_DOGS && (
            <AppText variant="caption" style={styles.helperText}>
              You can add up to 3 dogs right now.
            </AppText>
          )}
        </View>

        <View style={styles.humanSection}>
          <AppText variant="heading" style={styles.humanSectionTitle}>
            Little about yourself
          </AppText>

          <View style={styles.humanForm}>
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
                Date of Birth * (mm/dd/yyyy)
              </AppText>
              <TextInput
                style={[styles.input, dateError && styles.inputError]}
                value={dateOfBirth}
                onChangeText={handleDateChange}
                placeholder="mm/dd/yyyy"
                keyboardType="numeric"
                maxLength={10}
              />
              {dateError ? (
                <AppText variant="caption" color={Colors.accent} style={styles.errorText}>
                  {dateError}
                </AppText>
              ) : null}
            </View>

            <View style={styles.field}>
              <AppText variant="body" style={styles.label}>
                Gender *
              </AppText>
              <TouchableOpacity
                style={styles.dropdown}
                onPress={() => setShowGenderDropdown(true)}
              >
                <AppText variant="body" style={[styles.dropdownText, !gender && styles.placeholder]}>
                  {gender ? GENDERS.find(g => g.value === gender)?.label : 'Select gender'}
                </AppText>
                <MaterialIcons name="arrow-drop-down" size={24} color={Colors.text} />
              </TouchableOpacity>
              <Modal
                visible={showGenderDropdown}
                transparent
                animationType="fade"
                onRequestClose={() => setShowGenderDropdown(false)}
              >
                <TouchableOpacity
                  style={styles.modalOverlay}
                  activeOpacity={1}
                  onPress={() => setShowGenderDropdown(false)}
                >
                  <View style={styles.dropdownOptions}>
                    {GENDERS.map((option, index) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.dropdownOption,
                          index === GENDERS.length - 1 && styles.dropdownOptionLast,
                          gender === option.value && styles.dropdownOptionSelected,
                        ]}
                        onPress={() => {
                          setGender(option.value);
                          setShowGenderDropdown(false);
                        }}
                      >
                        <AppText
                          variant="body"
                          color={gender === option.value ? 'background' : 'text'}
                        >
                          {option.label}
                        </AppText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </TouchableOpacity>
              </Modal>
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
        </View>

        <View style={styles.buttonContainer}>
          <AppButton
            variant="primary"
            onPress={handleContinue}
            disabled={!canContinue}
            style={styles.button}
          >
            Continue
          </AppButton>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  title: {
    marginBottom: Spacing.sm,
  },
  subtitle: {
    opacity: 0.7,
  },
  dogsList: {
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
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
    marginBottom: Spacing.xs,
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
  disabledText: {
    opacity: 0.5,
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
  addButtonContainer: {
    marginBottom: Spacing.xl,
  },
  addButton: {
    padding: Spacing.md,
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonTextDisabled: {
    opacity: 0.6,
  },
  helperText: {
    textAlign: 'center',
    marginTop: Spacing.sm,
    opacity: 0.7,
  },
  humanSection: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  humanSectionTitle: {
    marginBottom: Spacing.lg,
  },
  humanForm: {
    marginTop: Spacing.md,
  },
  inputError: {
    borderColor: Colors.accent,
  },
  errorText: {
    marginTop: Spacing.xs,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.text,
    borderRadius: 8,
    padding: Spacing.md,
    minHeight: 44,
  },
  dropdownText: {
    flex: 1,
  },
  placeholder: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownOptions: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    minWidth: 200,
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  dropdownOption: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)', // Colors.text with opacity
  },
  dropdownOptionLast: {
    borderBottomWidth: 0,
  },
  dropdownOptionSelected: {
    backgroundColor: Colors.primary,
  },
  cityInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
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
  buttonContainer: {
    marginTop: Spacing.md,
  },
  button: {
    width: '100%',
  },
});
