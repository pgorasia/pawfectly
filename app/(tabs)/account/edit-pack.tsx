import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { AppButton } from '@/components/ui/AppButton';
import { useProfileDraft, DogProfile, AgeGroup, DogSize, EnergyLevel, PlayStyle, Temperament } from '@/hooks/useProfileDraft';
import { useMe } from '@/contexts/MeContext';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { deletePhotosByDogSlot } from '@/services/supabase/photoService';
import { saveDogData } from '@/services/supabase/onboardingService';
import { DogPrompts } from '@/components/dog/DogPrompts';
import { getAllDogPromptAnswers } from '@/services/prompts/dogPromptService';

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

// DogForm component for edit mode
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

export default function EditPackPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { me, updateMe, meLoaded } = useMe();
  const { updateDogs } = useProfileDraft();
  const [dogs, setDogs] = useState<DogProfile[]>([]);
  const [originalDogs, setOriginalDogs] = useState<DogProfile[]>([]);

  // Load initial data from Me (server cache) for edit mode initialization
  // Use prompts from me.dogs if available, otherwise fetch them
  useEffect(() => {
    const loadDogsWithPrompts = async () => {
      if (me.dogs.length === 0) {
        setDogs([]);
        setOriginalDogs([]);
        return;
      }

      const loadedDogs = me.dogs.slice(0, MAX_DOGS).map((dog, index) => ({
        ...dog,
        slot: dog.slot || (index + 1),
      }));

      // Check if prompts are already loaded in me.dogs
      // If meLoaded is true and any dog has prompts as an array, we know loadBootstrap ran
      // If meLoaded is false or no dogs have prompts, we need to fetch them
      const hasLoadedPrompts = meLoaded && loadedDogs.some(dog => Array.isArray(dog.prompts));
      
      if (hasLoadedPrompts) {
        // Prompts are already available from loadBootstrap, use them directly
        setDogs(loadedDogs);
        setOriginalDogs(loadedDogs);
        return;
      }

      // Prompts not available yet, fetch them
      if (user?.id) {
        try {
          const allPrompts = await getAllDogPromptAnswers(user.id);
          
          const dogsWithPrompts = loadedDogs.map(dog => {
            // Use existing prompts if available, otherwise use fetched prompts
            if (Array.isArray(dog.prompts)) {
              return dog;
            }
            const prompts = allPrompts[dog.slot];
            return {
              ...dog,
              prompts: prompts?.map(p => ({
                prompt_question_id: p.prompt_question_id,
                answer_text: p.answer_text,
                display_order: p.display_order,
              })),
            };
          });

          setDogs(dogsWithPrompts);
          setOriginalDogs(dogsWithPrompts);
        } catch (error) {
          console.error('[EditPackPage] Failed to load prompts:', error);
          // Continue without prompts
          setDogs(loadedDogs);
          setOriginalDogs(loadedDogs);
        }
      } else {
        setDogs(loadedDogs);
        setOriginalDogs(loadedDogs);
      }
    };

    loadDogsWithPrompts();
  }, [me.dogs, meLoaded, user?.id]);

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

  // Check if new dogs were added (dogs with slots that weren't in original)
  const hasNewDogs = (): boolean => {
    const originalSlots = new Set(originalDogs.map(d => d.slot));
    return dogs.some(dog => !originalSlots.has(dog.slot));
  };

  // Save handler
  const handleSave = async () => {
    if (!user?.id || !validateDogs()) return;

    try {
      // Update draft context (for edit forms)
      updateDogs(dogs);
      
      // Update Me optimistically (server cache)
      updateMe({ dogs });
      
      // Save to database
      await saveDogData(user.id, dogs);

      // Check if new dogs were added and navigate accordingly
      const originalSlots = new Set(originalDogs.map(d => d.slot));
      const hasNewDogs = dogs.some(dog => !originalSlots.has(dog.slot));
      
      if (hasNewDogs) {
        // Navigate to account page with photos tab active
        router.replace('/(tabs)/account?tab=photos');
      } else {
        // Navigate back to account page
        router.back();
      }
    } catch (error) {
      console.error('[EditPackPage] Failed to save dogs:', error);
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

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
            </TouchableOpacity>
            <AppText variant="heading" style={styles.title}>
              Edit Your Pack
            </AppText>
          </View>

          <View style={styles.dogsList}>
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
              style={styles.addButton}
            >
              <AppText variant="body" color={Colors.primary}>
                + Add another dog
              </AppText>
            </TouchableOpacity>
          )}

          <View style={styles.buttonContainer}>
            <AppButton
              variant="primary"
              onPress={handleSave}
              disabled={!validateDogs()}
              style={styles.button}
            >
              Save
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
    padding: Spacing.lg,
    paddingBottom: 100, // Extra padding to ensure save button is visible above keyboard
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
    opacity: 0.6,
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
});
