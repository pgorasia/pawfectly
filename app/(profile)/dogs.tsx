import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { ProgressBar } from '@/components/common/ProgressBar';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { useProfileDraft, DogProfile, AgeGroup, DogSize, EnergyLevel, PlayStyle, Temperament, Gender } from '@/hooks/useProfileDraft';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useMe } from '@/contexts/MeContext';
import { deletePhotosByDogSlot } from '@/services/supabase/photoService';
import { saveDogData } from '@/services/supabase/onboardingService';
import { markSubmitted, setLastStep, getOrCreateOnboarding } from '@/services/profile/statusRepository';
import { DogPrompts } from '@/components/dog/DogPrompts';

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

      <DogPrompts dog={dog} onUpdate={onUpdate} />
    </Card>
  );
}

export default function DogsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { me } = useMe();
  const { draft, draftHydrated, updateDogs, updateDog } = useProfileDraft();

  // Set current step when page loads or when user navigates back to this screen
  // Only update onboarding_status if lifecycle_status is 'onboarding' (or profile doesn't exist yet - new user)
  // Uses cached lifecycle_status from MeContext instead of DB query
  useFocusEffect(
    React.useCallback(() => {
      if (user?.id) {
        // Use cached lifecycle_status from Me (already loaded)
        const lifecycleStatus = me.profile?.lifecycle_status;
        
        // If profile doesn't exist (new user) or lifecycle_status is 'onboarding', update onboarding_status
        if (!lifecycleStatus || lifecycleStatus === 'onboarding') {
          // First ensure the row exists, then set the step
          // Pass userId from context to avoid network call
          getOrCreateOnboarding(user?.id ?? null)
            .then(() => setLastStep(user.id, 'pack'))
            .catch((error) => {
              console.error('[DogsScreen] Failed to set current step:', error);
            });
        } else {
          console.log(
            `[DogsScreen] Skipping onboarding_status update - lifecycle_status is '${lifecycleStatus}', not 'onboarding'`
          );
        }
      }
    }, [user?.id, me.profile?.lifecycle_status])
  );

  // Ensure draft has at least one dog
  useEffect(() => {
    // Wait for draft to hydrate from server-state (Me) before creating placeholders.
    // This prevents a race where an empty placeholder dog masks real dogs loaded shortly after login.
    if (!draftHydrated) return;

    if (draft.dogs.length === 0) {
      const defaultDog: DogProfile = {
        id: `dog-${Date.now()}`,
        slot: 1,
        name: '',
        ageGroup: null,
        breed: '',
        size: null,
        energy: null,
        playStyles: [],
        temperament: null,
      };
      updateDogs([defaultDog]);
    }
  }, [draftHydrated, draft.dogs.length, updateDogs]);

  // Get dogs from draft
  const dogs = draft.dogs.slice(0, MAX_DOGS).map((dog, index) => ({
    ...dog,
    slot: dog.slot || (index + 1), // Ensure slot is set
  }));

  const handleAddDog = () => {
    if (dogs.length >= MAX_DOGS) return;
    
    // Assign lowest available slot (1-3) not used by existing dogs
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
    updateDogs([...dogs, newDog]);
  };

  const handleRemoveDog = async (id: string) => {
    const dogToRemove = dogs.find((dog) => dog.id === id);
    if (!dogToRemove) return;

    // Clear photos for this dog slot
    if (user?.id && dogToRemove.slot) {
      try {
        await deletePhotosByDogSlot(user.id, dogToRemove.slot);
      } catch (error) {
        console.error('Failed to delete photos for dog slot:', error);
        // Continue with removing the dog even if photo deletion fails
      }
    }

    // Remove dog from draft
    updateDogs(dogs.filter((dog) => dog.id !== id));
  };

  const handleUpdateDog = (id: string, updates: Partial<DogProfile>) => {
    updateDog(id, updates);
  };


  const handleContinue = () => {
    // Draft is already updated via handleUpdateDog, so we can proceed
    // Save to database asynchronously (non-blocking) - fire-and-forget autosave
    if (user?.id) {
      // Save only dogs for now, human data will be saved on the human page
      saveDogData(user.id, dogs).catch((error) => {
        console.error('[DogsScreen] Failed to save dog data:', error);
        // Don't block navigation on error
      });

      // Mark dog as submitted and advance to human step
      markSubmitted(user.id, 'dog').catch((error) => {
        console.error('[DogsScreen] Failed to mark dog as submitted:', error);
        // Don't block navigation on error
      });
    }

    router.push('/(profile)/human');
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

  const canContinue = dogsValid;

  return (
    <ScreenContainer>
      <ProgressBar
        currentStep={1}
        totalSteps={4}
        stepTitles={['Your Pack', 'Little about you', 'Photos', 'Preferences']}
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
  buttonContainer: {
    marginTop: Spacing.md,
  },
  button: {
    width: '100%',
  },
});
