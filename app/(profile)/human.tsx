import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { ProgressBar } from '@/components/common/ProgressBar';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { useProfileDraft, Gender } from '@/hooks/useProfileDraft';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useMe } from '@/contexts/MeContext';
import { searchLocation } from '@/services/geocoding/locationService';
import { saveHumanData } from '@/services/supabase/onboardingService';
import { markSubmitted, setLastStep, getOrCreateOnboarding } from '@/services/profile/statusRepository';

const GENDERS: { label: string; value: Gender }[] = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Trans', value: 'trans' },
  { label: 'Non-binary', value: 'non-binary' },
  { label: 'Prefer not to say', value: 'prefer-not-to-say' },
];

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

export default function HumanScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { me } = useMe();
  const { draft, updateHuman, updateLocation } = useProfileDraft();

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
            .then(() => setLastStep(user.id, 'human'))
            .catch((error) => {
              console.error('[HumanScreen] Failed to set current step:', error);
            });
        } else {
          console.log(
            `[HumanScreen] Skipping onboarding_status update - lifecycle_status is '${lifecycleStatus}', not 'onboarding'`
          );
        }
      }
    }, [user?.id, me.profile?.lifecycle_status])
  );

  // Bind directly to draft
  const name = draft.human?.name || '';
  const dateOfBirth = draft.human?.dateOfBirth || '';
  const gender = draft.human?.gender || null;
  const locationFromGPS = draft.location?.useCurrentLocation || false;
  const city = draft.location?.city || '';
  
  const [dateError, setDateError] = useState('');
  const [showGenderDropdown, setShowGenderDropdown] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<{ name: string; fullAddress: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const handleDateChange = (text: string) => {
    const formatted = formatDateInput(text);
    updateHuman({ dateOfBirth: formatted });
    
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
    updateLocation({
      useCurrentLocation: true,
      city: detectedCity,
      latitude: 37.7749, // Fake SF coordinates - in production, use actual GPS
      longitude: -122.4194,
    });
    setShowSuggestions(false);
  };

  const handleCityChange = async (text: string) => {
    updateLocation({
      useCurrentLocation: false,
      city: text,
      latitude: undefined,
      longitude: undefined,
    });
    
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
    updateLocation({
      useCurrentLocation: false,
      city: selectedCity.fullAddress,
      latitude: undefined,
      longitude: undefined,
    });
    setShowSuggestions(false);
  };

  const handleContinue = () => {
    if (dateError) return;
    
    // Draft is already updated via onChange handlers, so we can proceed
    // Update location if needed - save city from GPS or manual entry
    const cityToSave = city.trim();
    
    const locationData = {
      useCurrentLocation: locationFromGPS,
      city: cityToSave,
      latitude: locationFromGPS ? 37.7749 : undefined, // Fake SF coordinates - in production, use actual GPS
      longitude: locationFromGPS ? -122.4194 : undefined,
    };
    
    updateLocation(locationData);

    // Save to database asynchronously (non-blocking) - fire-and-forget autosave
    if (user?.id) {
      saveHumanData(user.id, {
        name,
        dateOfBirth,
        gender,
      }, locationData).catch((error) => {
        console.error('[HumanScreen] Failed to save human data:', error);
        // Don't block navigation on error
      });

      // Mark human as submitted and advance to photos step
      markSubmitted(user.id, 'human').catch((error) => {
        console.error('[HumanScreen] Failed to mark human as submitted:', error);
        // Don't block navigation on error
      });
    }

    router.push('/(profile)/photos');
  };

  const canContinue = 
    name.trim().length > 0 && 
    dateOfBirth.length === 10 && 
    isValidDate(dateOfBirth) &&
    is18Plus(dateOfBirth) &&
    gender !== null &&
    !dateError &&
    (locationFromGPS || city.trim().length > 0);

  return (
    <ScreenContainer showBottomSpacer={true}>
      <ProgressBar
        currentStep={2}
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
            <View style={styles.headerTop}>
            <TouchableOpacity
              onPress={() => router.push('/(profile)/dogs')}
              style={styles.backButton}
            >
              <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
            </TouchableOpacity>
            </View>
            <AppText variant="heading" style={styles.title}>
              Little about yourself
            </AppText>
          </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <AppText variant="body" style={styles.label}>
              Name *
            </AppText>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={(text) => updateHuman({ name: text })}
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
                        updateHuman({ gender: option.value });
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
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  backButton: {
    padding: Spacing.sm,
    marginLeft: -Spacing.sm,
  },
  title: {
    marginBottom: Spacing.sm,
  },
  subtitle: {
    opacity: 0.7,
  },
  form: {
    marginTop: Spacing.md,
  },
  field: {
    marginBottom: Spacing.lg,
  },
  label: {
    marginBottom: Spacing.sm,
    fontWeight: '600',
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
