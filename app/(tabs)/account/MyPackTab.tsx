import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { AppButton } from '@/components/ui/AppButton';
import { useProfileDraft, AgeGroup, DogSize, EnergyLevel, PlayStyle, Temperament } from '@/hooks/useProfileDraft';
import { useMe } from '@/contexts/MeContext';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { saveHumanData } from '@/services/supabase/onboardingService';
import { searchLocation } from '@/services/geocoding/locationService';
import { DogPromptsDisplay } from '@/components/dog/DogPromptsDisplay';

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


type EditMode = 'none' | 'human';

interface MyPackTabProps {
  onNewDogAdded?: () => void;
}

export default function MyPackTab({ onNewDogAdded }: MyPackTabProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { me, updateMe } = useMe();
  const { updateHuman, updateLocation } = useProfileDraft();
  const [editMode, setEditMode] = useState<EditMode>('none');
  
  // Edit mode state for human
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<{ name: string; fullAddress: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [locationFromGPS, setLocationFromGPS] = useState(false);

  // Navigate to edit pack page
  const handleEditDogs = () => {
    router.push('/(tabs)/account/edit-pack');
  };

  const handleEditHuman = () => {
    // Convert Me profile to human format for edit
    const humanName = me.profile?.display_name || '';
    setName(humanName);
    setCity(me.profile?.city || '');
    setLocationFromGPS(!!(me.profile?.latitude && me.profile?.longitude));
    setEditMode('human');
  };

  const handleCancelEdit = () => {
    setEditMode('none');
    setName('');
    setCity('');
    setLocationFromGPS(false);
  };

  // Validation
  const validateHuman = (): boolean => {
    return name.trim().length > 0;
  };

  const handleSaveHuman = async () => {
    if (!user?.id || !validateHuman()) return;

    try {
      // Update draft context (for edit forms)
      updateHuman({ name });
      updateLocation({
        useCurrentLocation: locationFromGPS,
        city: city.trim(),
        latitude: locationFromGPS ? me.profile?.latitude : undefined,
        longitude: locationFromGPS ? me.profile?.longitude : undefined,
      });

      // Update Me optimistically (server cache)
      if (me.profile) {
        updateMe({
          profile: {
            ...me.profile,
            display_name: name,
            city: city.trim(),
            latitude: locationFromGPS ? me.profile.latitude : null,
            longitude: locationFromGPS ? me.profile.longitude : null,
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
          latitude: locationFromGPS ? me.profile?.latitude : undefined,
          longitude: locationFromGPS ? me.profile?.longitude : undefined,
        }
      );

      // Exit edit mode
      setEditMode('none');
    } catch (error) {
      console.error('[MyPackTab] Failed to save human data:', error);
    }
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
                <DogPromptsDisplay dog={dog} />
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
