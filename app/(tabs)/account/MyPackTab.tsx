import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { AppButton } from '@/components/ui/AppButton';
import { useProfileDraft, DogProfile, AgeGroup, DogSize, EnergyLevel, PlayStyle, Temperament } from '@/hooks/useProfileDraft';
import { useMe } from '@/contexts/MeContext';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { deletePhotosByDogSlot, getDogPhotos } from '@/services/supabase/photoService';
import { updateProfileData, saveDogData, saveHumanData } from '@/services/supabase/onboardingService';
import { searchLocation } from '@/services/geocoding/locationService';

// Import constants from dogs.tsx - we'll reuse them
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

type EditMode = 'none' | 'dogs' | 'human';

// DogForm component for edit mode (reused from onboarding)
function DogFormEdit({
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
    <Card style={editStyles.dogCard}>
      <View style={editStyles.dogHeader}>
        <AppText variant="heading" style={editStyles.dogTitle}>
          {dog.name || 'New Dog'}
        </AppText>
        {canRemove && (
          <TouchableOpacity onPress={onRemove} style={editStyles.removeButton}>
            <AppText variant="caption" color={Colors.accent}>
              Remove
            </AppText>
          </TouchableOpacity>
        )}
      </View>

      <View style={editStyles.field}>
        <AppText variant="body" style={editStyles.label}>
          Name *
        </AppText>
        <TextInput
          style={editStyles.input}
          value={dog.name}
          onChangeText={(text) => onUpdate({ name: text })}
          placeholder="Enter dog's name"
        />
      </View>

      <View style={editStyles.field}>
        <AppText variant="body" style={editStyles.label}>
          Age Group *
        </AppText>
        <View style={editStyles.optionsRow}>
          {AGE_GROUPS.map((group) => (
            <TouchableOpacity
              key={group.value}
              style={[
                editStyles.optionButton,
                dog.ageGroup === group.value && editStyles.optionButtonSelected,
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

      <View style={editStyles.field}>
        <AppText variant="body" style={editStyles.label}>
          Breed *
        </AppText>
        <TouchableOpacity
          style={editStyles.input}
          onPress={() => setShowBreedModal(true)}
        >
          <AppText
            variant="body"
            color={dog.breed ? 'text' : Colors.text}
            style={!dog.breed && editStyles.placeholder}
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
          <View style={editStyles.modalOverlay}>
            <View style={editStyles.modalContent}>
              <View style={editStyles.modalHeader}>
                <AppText variant="heading">Select Breed</AppText>
                <TouchableOpacity onPress={() => setShowBreedModal(false)}>
                  <AppText variant="body" color={Colors.primary}>Close</AppText>
                </TouchableOpacity>
              </View>
              <TextInput
                style={editStyles.searchInput}
                placeholder="Search breeds..."
                value={breedSearch}
                onChangeText={setBreedSearch}
              />
              <ScrollView style={editStyles.breedList}>
                {filteredBreeds.map((breed) => (
                  <TouchableOpacity
                    key={breed}
                    style={[
                      editStyles.breedItem,
                      dog.breed === breed && editStyles.breedItemSelected,
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

      <View style={editStyles.field}>
        <AppText variant="body" style={editStyles.label}>
          Size *
        </AppText>
        <View style={editStyles.optionsRow}>
          {SIZES.map((size) => (
            <TouchableOpacity
              key={size.value}
              style={[
                editStyles.optionButton,
                dog.size === size.value && editStyles.optionButtonSelected,
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

      <View style={editStyles.field}>
        <AppText variant="body" style={editStyles.label}>
          Energy Level *
        </AppText>
        <View style={editStyles.optionsRow}>
          {ENERGY_LEVELS.map((level) => (
            <TouchableOpacity
              key={level.value}
              style={[
                editStyles.optionButton,
                dog.energy === level.value && editStyles.optionButtonSelected,
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

      <View style={editStyles.field}>
        <AppText variant="body" style={editStyles.label}>
          Play Styles (select up to 3) *
        </AppText>
        <AppText variant="caption" style={editStyles.hint}>
          {dog.playStyles?.length || 0} of 3 selected
        </AppText>
        <View style={editStyles.playStylesGrid}>
          {PLAY_STYLES.map((style) => {
            const isSelected = dog.playStyles?.includes(style.value) || false;
            const isDisabled = !isSelected && (dog.playStyles?.length || 0) >= 3;
            return (
              <TouchableOpacity
                key={style.value}
                style={[
                  editStyles.playStyleButton,
                  isSelected && editStyles.playStyleButtonSelected,
                  isDisabled && editStyles.playStyleButtonDisabled,
                ]}
                onPress={() => togglePlayStyle(style.value)}
                disabled={isDisabled}
              >
                <AppText
                  variant="caption"
                  color={isSelected ? 'background' : 'text'}
                  style={isDisabled && editStyles.disabledText}
                >
                  {style.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={editStyles.field}>
        <AppText variant="body" style={editStyles.label}>
          Temperament *
        </AppText>
        <View style={editStyles.optionsRow}>
          {TEMPERAMENTS.map((temp) => (
            <TouchableOpacity
              key={temp.value}
              style={[
                editStyles.optionButton,
                dog.temperament === temp.value && editStyles.optionButtonSelected,
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

interface MyPackTabProps {
  onNewDogAdded?: () => void;
}

export default function MyPackTab({ onNewDogAdded }: MyPackTabProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { me, updateMe } = useMe();
  const { draft, updateDogs, updateHuman, updateLocation } = useProfileDraft();
  const [editMode, setEditMode] = useState<EditMode>('none');
  
  // Store original data to compare for new dogs detection
  const [originalDogs, setOriginalDogs] = useState<DogProfile[]>([]);
  
  // Edit mode state
  const [dogs, setDogs] = useState<DogProfile[]>([]);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<{ name: string; fullAddress: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [locationFromGPS, setLocationFromGPS] = useState(false);

  // Load initial data from Me (server cache) for edit mode initialization
  useEffect(() => {
    const loadedDogs = me.dogs.length > 0
      ? me.dogs.slice(0, MAX_DOGS).map((dog, index) => ({
          ...dog,
          slot: dog.slot || (index + 1),
        }))
      : [];
    setOriginalDogs(loadedDogs);
  }, [me.dogs]);

  // Enter edit mode - initialize from Me (server cache)
  const handleEditDogs = () => {
    const loadedDogs = me.dogs.length > 0
      ? me.dogs.slice(0, MAX_DOGS).map((dog, index) => ({
          ...dog,
          slot: dog.slot || (index + 1),
        }))
      : [];
    setDogs(loadedDogs);
    setOriginalDogs(loadedDogs);
    setEditMode('dogs');
  };

  const handleEditHuman = () => {
    // Convert Me profile to human format for edit
    const humanName = me.profile?.display_name || '';
    setName(humanName);
    setCity(me.profile?.city || '');
    setLocationFromGPS(!!(me.profile?.lat && me.profile?.lng));
    setEditMode('human');
  };

  const handleCancelEdit = () => {
    setEditMode('none');
    setDogs([]);
    setName('');
    setCity('');
    setLocationFromGPS(false);
  };

  // Validation
  const validateDogs = (): boolean => {
    if (dogs.length === 0) return false;
    return dogs.every((dog) => {
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
  };

  const validateHuman = (): boolean => {
    return name.trim().length > 0;
  };

  // Check if new dogs were added (dogs with slots that weren't in original)
  const hasNewDogs = (): boolean => {
    const originalSlots = new Set(originalDogs.map(d => d.slot));
    return dogs.some(dog => !originalSlots.has(dog.slot));
  };

  // Save handlers
  const handleSaveDogs = async () => {
    if (!user?.id || !validateDogs()) return;

    try {
      // Update draft context (for edit forms)
      updateDogs(dogs);
      
      // Update Me optimistically (server cache)
      updateMe({ dogs });
      
      // Save to database
      await saveDogData(user.id, dogs);

      // Exit edit mode
      setEditMode('none');
      
      // Refresh the view by updating original dogs
      setOriginalDogs(dogs);

      // If new dogs were added, switch to photos tab
      if (hasNewDogs() && onNewDogAdded) {
        onNewDogAdded();
      }
    } catch (error) {
      console.error('[MyPackTab] Failed to save dogs:', error);
    }
  };

  const handleSaveHuman = async () => {
    if (!user?.id || !validateHuman()) return;

    try {
      // Update draft context (for edit forms)
      updateHuman({ name });
      updateLocation({
        useCurrentLocation: locationFromGPS,
        city: city.trim(),
        latitude: locationFromGPS ? me.profile?.lat : undefined,
        longitude: locationFromGPS ? me.profile?.lng : undefined,
      });

      // Update Me optimistically (server cache)
      if (me.profile) {
        updateMe({
          profile: {
            ...me.profile,
            display_name: name,
            city: city.trim(),
            lat: locationFromGPS ? me.profile.lat : null,
            lng: locationFromGPS ? me.profile.lng : null,
          },
        });
      }

      // Save to database
      await saveHumanData(
        user.id,
        { name, dateOfBirth: me.profile?.dob || '', gender: me.profile?.gender || null },
        {
          useCurrentLocation: locationFromGPS,
          city: city.trim(),
          latitude: locationFromGPS ? me.profile?.lat : undefined,
          longitude: locationFromGPS ? me.profile?.lng : undefined,
        }
      );

      // Exit edit mode
      setEditMode('none');
    } catch (error) {
      console.error('[MyPackTab] Failed to save human data:', error);
    }
  };

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

  // Render read-only view
  if (editMode === 'none') {
    return (
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* My Dogs Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <AppText variant="heading" style={styles.sectionTitle}>
              My Dogs
            </AppText>
            <TouchableOpacity onPress={handleEditDogs} style={styles.editButton}>
              <AppText variant="body" color={Colors.primary}>
                Edit
              </AppText>
            </TouchableOpacity>
          </View>
          
          {me.dogs.length === 0 ? (
            <AppText variant="body" style={styles.emptyText}>
              No dogs added yet
            </AppText>
          ) : (
            me.dogs.map((dog) => (
              <Card key={dog.id} style={styles.dogCard}>
                <AppText variant="heading" style={styles.dogName}>
                  {dog.name || 'Unnamed Dog'}
                </AppText>
                <View style={styles.dogDetails}>
                  <View style={styles.dogDetailRow}>
                    <AppText variant="body" style={styles.dogLabel}>
                      Breed
                    </AppText>
                    <AppText variant="body" style={styles.dogValue}>
                      {dog.breed || 'Not set'}
                    </AppText>
                  </View>
                  <View style={styles.dogDetailRow}>
                    <AppText variant="body" style={styles.dogLabel}>
                      Age Group
                    </AppText>
                    <AppText variant="body" style={styles.dogValue}>
                      {dog.ageGroup ? AGE_GROUPS.find(g => g.value === dog.ageGroup)?.label : 'Not set'}
                    </AppText>
                  </View>
                  <View style={styles.dogDetailRow}>
                    <AppText variant="body" style={styles.dogLabel}>
                      Size
                    </AppText>
                    <AppText variant="body" style={styles.dogValue}>
                      {dog.size ? SIZES.find(s => s.value === dog.size)?.label : 'Not set'}
                    </AppText>
                  </View>
                  <View style={styles.dogDetailRow}>
                    <AppText variant="body" style={styles.dogLabel}>
                      Energy Level
                    </AppText>
                    <AppText variant="body" style={styles.dogValue}>
                      {dog.energy ? ENERGY_LEVELS.find(e => e.value === dog.energy)?.label : 'Not set'}
                    </AppText>
                  </View>
                  <View style={styles.dogDetailRow}>
                    <AppText variant="body" style={styles.dogLabel}>
                      Play Style
                    </AppText>
                    <AppText variant="body" style={styles.dogValue}>
                      {dog.playStyles && dog.playStyles.length > 0 
                        ? dog.playStyles.map(style => PLAY_STYLES.find(s => s.value === style)?.label || style).join(', ')
                        : 'Not set'}
                    </AppText>
                  </View>
                  <View style={styles.dogDetailRow}>
                    <AppText variant="body" style={styles.dogLabel}>
                      Temperament
                    </AppText>
                    <AppText variant="body" style={styles.dogValue}>
                      {dog.temperament ? TEMPERAMENTS.find(t => t.value === dog.temperament)?.label : 'Not set'}
                    </AppText>
                  </View>
                </View>
              </Card>
            ))
          )}
        </View>

        {/* About Me Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <AppText variant="heading" style={styles.sectionTitle}>
              About Me
            </AppText>
            <TouchableOpacity onPress={handleEditHuman} style={styles.editButton}>
              <AppText variant="body" color={Colors.primary}>
                Edit
              </AppText>
            </TouchableOpacity>
          </View>
          
          <Card style={styles.humanCard}>
            <View style={styles.humanDetail}>
              <AppText variant="body" style={styles.humanLabel}>
                Name
              </AppText>
              <AppText variant="body" style={styles.humanValue}>
                {me.profile?.display_name || 'Not set'}
              </AppText>
            </View>
            <View style={styles.humanDetail}>
              <AppText variant="body" style={styles.humanLabel}>
                Date of Birth
              </AppText>
              <AppText variant="body" style={styles.humanValue}>
                {me.profile?.dob || 'Not set'}
              </AppText>
            </View>
            <View style={styles.humanDetail}>
              <AppText variant="body" style={styles.humanLabel}>
                Gender
              </AppText>
              <AppText variant="body" style={styles.humanValue}>
                {me.profile?.gender 
                  ? me.profile.gender.charAt(0).toUpperCase() + me.profile.gender.slice(1).replace(/-/g, ' ')
                  : 'Not set'}
              </AppText>
            </View>
            <View style={styles.humanDetail}>
              <AppText variant="body" style={styles.humanLabel}>
                City
              </AppText>
              <AppText variant="body" style={styles.humanValue}>
                {me.profile?.city || 'Not set'}
              </AppText>
            </View>
          </Card>
        </View>
      </ScrollView>
    );
  }

  // Render edit mode for dogs
  if (editMode === 'dogs') {
    return (
      <KeyboardAvoidingView
        style={editStyles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={editStyles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={editStyles.header}>
            <TouchableOpacity onPress={handleCancelEdit} style={editStyles.backButton}>
              <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
            </TouchableOpacity>
            <AppText variant="heading" style={editStyles.title}>
              Edit Your Pack
            </AppText>
          </View>

          <View style={editStyles.dogsList}>
            {dogs.map((dog) => (
              <DogFormEdit
                key={dog.id}
                dog={dog}
                onUpdate={(updates) => handleUpdateDog(dog.id, updates)}
                onRemove={() => handleRemoveDog(dog.id)}
                canRemove={dogs.length > 1}
              />
            ))}
          </View>

          {dogs.length < MAX_DOGS && (
            <TouchableOpacity 
              onPress={handleAddDog} 
              style={editStyles.addButton}
            >
              <AppText variant="body" color={Colors.primary}>
                + Add another dog
              </AppText>
            </TouchableOpacity>
          )}

          <View style={editStyles.buttonContainer}>
            <AppButton
              variant="primary"
              onPress={handleSaveDogs}
              disabled={!validateDogs()}
              style={editStyles.button}
            >
              Save
            </AppButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Render edit mode for human
  if (editMode === 'human') {
    return (
      <KeyboardAvoidingView
        style={editStyles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={editStyles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={editStyles.header}>
            <TouchableOpacity onPress={handleCancelEdit} style={editStyles.backButton}>
              <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
            </TouchableOpacity>
            <AppText variant="heading" style={editStyles.title}>
              Edit About Me
            </AppText>
          </View>

          <View style={editStyles.field}>
            <AppText variant="body" style={editStyles.label}>
              Name *
            </AppText>
            <TextInput
              style={editStyles.input}
              value={name}
              onChangeText={setName}
              placeholder="Enter your name"
            />
          </View>

          <View style={editStyles.field}>
            <AppText variant="body" style={editStyles.label}>
              Date of Birth
            </AppText>
            <View style={[editStyles.input, editStyles.disabledInput]}>
              <AppText variant="body" style={editStyles.disabledText}>
                {me.profile?.dob || 'Not set'}
              </AppText>
            </View>
            <AppText variant="caption" style={editStyles.hint}>
              Date of birth cannot be changed
            </AppText>
          </View>

          <View style={editStyles.field}>
            <AppText variant="body" style={editStyles.label}>
              Gender
            </AppText>
            <View style={[editStyles.input, editStyles.disabledInput]}>
              <AppText variant="body" style={editStyles.disabledText}>
                {me.profile?.gender 
                  ? me.profile.gender.charAt(0).toUpperCase() + me.profile.gender.slice(1).replace(/-/g, ' ')
                  : 'Not set'}
              </AppText>
            </View>
            <AppText variant="caption" style={editStyles.hint}>
              Gender cannot be changed
            </AppText>
          </View>

          <View style={editStyles.field}>
            <AppText variant="body" style={editStyles.label}>
              City or Zip Code
            </AppText>
            <View style={editStyles.cityInputRow}>
              <View style={editStyles.inputWrapper}>
                <TextInput
                  style={editStyles.input}
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
                  <View style={editStyles.searchingIndicator}>
                    <AppText variant="caption" style={editStyles.searchingText}>
                      Searching...
                    </AppText>
                  </View>
                )}
                {showSuggestions && citySuggestions.length > 0 && (
                  <View style={editStyles.suggestionsContainer}>
                    {citySuggestions.map((suggestion, index) => (
                      <TouchableOpacity
                        key={index}
                        style={editStyles.suggestionItem}
                        onPress={() => selectCity(suggestion)}
                      >
                        <AppText variant="body">{suggestion.fullAddress}</AppText>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <TouchableOpacity
                style={editStyles.gpsButton}
                onPress={handleUseCurrentLocation}
              >
                <MaterialIcons name="my-location" size={24} color={Colors.primary} />
              </TouchableOpacity>
            </View>
            <AppText variant="caption" style={editStyles.privacyNote}>
              We'll never show your exact location.
            </AppText>
          </View>

          <View style={editStyles.buttonContainer}>
            <AppButton
              variant="primary"
              onPress={handleSaveHuman}
              disabled={!validateHuman()}
              style={editStyles.button}
            >
              Save
            </AppButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return null;
}

// Read-only view styles
const styles = StyleSheet.create({
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    flex: 1,
  },
  editButton: {
    padding: Spacing.sm,
  },
  emptyText: {
    opacity: 0.6,
    fontStyle: 'italic',
  },
  dogCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  dogName: {
    marginBottom: Spacing.md,
  },
  dogDetails: {
    gap: 0,
  },
  dogDetailRow: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  dogLabel: {
    fontWeight: '600',
    marginRight: Spacing.sm,
    minWidth: 120,
  },
  dogValue: {
    flex: 1,
    opacity: 0.7,
  },
  humanCard: {
    padding: Spacing.md,
  },
  humanDetail: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  humanLabel: {
    fontWeight: '600',
    marginRight: Spacing.sm,
    minWidth: 120,
  },
  humanValue: {
    flex: 1,
    opacity: 0.7,
  },
});

// Edit mode styles (reused from onboarding pages)
const editStyles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  backButton: {
    padding: Spacing.sm,
    marginLeft: -Spacing.sm,
    marginRight: Spacing.md,
  },
  title: {
    flex: 1,
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
    marginBottom: Spacing.lg,
  },
  buttonContainer: {
    marginTop: Spacing.lg,
  },
  button: {
    width: '100%',
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
