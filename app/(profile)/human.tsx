import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { ProgressBar } from '@/components/common/ProgressBar';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { useProfileDraft, Gender } from '@/hooks/useProfileDraft';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';

import { searchLocation } from '@/services/geocoding/locationService';

const GENDERS: { label: string; value: Gender }[] = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Trans', value: 'trans' },
  { label: 'Non-binary', value: 'non-binary' },
  { label: 'Self-described', value: 'self-described' },
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
  const { draft, updateHuman, updateLocation } = useProfileDraft();
  const [name, setName] = useState(draft.human.name || '');
  const [dateOfBirth, setDateOfBirth] = useState(draft.human.dateOfBirth || '');
  const [gender, setGender] = useState<Gender | null>(draft.human.gender);
  const [dateError, setDateError] = useState('');
  const [useCurrentLocation, setUseCurrentLocation] = useState(
    draft.location?.useCurrentLocation || false
  );
  const [city, setCity] = useState(draft.location?.city || '');
  const [citySuggestions, setCitySuggestions] = useState<{ name: string; fullAddress: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

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
    setUseCurrentLocation(true);
    setCity(detectedCity); // Populate the city field
    setShowSuggestions(false);
  };

  const handleCityChange = async (text: string) => {
    setCity(text);
    setUseCurrentLocation(false); // If user types, they're not using GPS
    
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

  const handleContinue = () => {
    if (dateError) return;
    
    // Update human details
    updateHuman({
      name,
      dateOfBirth,
      gender,
    });

    // Update location
    if (useCurrentLocation) {
      updateLocation({
        useCurrentLocation: true,
        latitude: 37.7749, // Fake SF coordinates - in production, use actual GPS
        longitude: -122.4194,
        city: city || 'San Francisco, CA',
      });
    } else {
      updateLocation({
        useCurrentLocation: false,
        city: city.trim(),
        latitude: undefined,
        longitude: undefined,
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
    (useCurrentLocation || city.trim().length > 0);

  return (
    <ScreenContainer>
      <ProgressBar
        currentStep={1}
        totalSteps={3}
        stepTitles={['My Pack', 'Photos', 'Preferences']}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <AppText variant="heading" style={styles.title}>
            Tell us about yourself
          </AppText>
          <AppText variant="body" style={styles.subtitle}>
            Help others get to know you
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
            <View style={styles.genderGrid}>
              {GENDERS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.genderButton,
                    gender === option.value && styles.genderButtonSelected,
                  ]}
                  onPress={() => setGender(option.value)}
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
          </View>
        </View>

        {/* Location Section */}
        <View style={styles.locationSection}>
          <View style={styles.locationHeader}>
            <AppText variant="heading" style={styles.locationTitle}>
              Where does your pack usually hang out?
            </AppText>
          </View>

          <View style={styles.locationControls}>
            <AppButton
              variant="primary"
              onPress={handleUseCurrentLocation}
              style={styles.locationButton}
            >
              Use my current location
            </AppButton>

            <View style={styles.cityInputContainer}>
              <AppText variant="body" style={styles.label}>
                City or Zip Code
              </AppText>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.input, useCurrentLocation && styles.inputDisabled]}
                  value={city}
                  onChangeText={handleCityChange}
                  placeholder="Enter city name or zip code"
                  editable={!useCurrentLocation}
                  onFocus={() => {
                    if (citySuggestions.length > 0 && !useCurrentLocation) {
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
                {showSuggestions && citySuggestions.length > 0 && !useCurrentLocation && (
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
            </View>

            <AppText variant="caption" style={styles.privacyNote}>
              We'll never show your exact location.
            </AppText>
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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
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
  form: {
    flex: 1,
  },
  field: {
    marginBottom: Spacing.xl,
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
  },
  inputError: {
    borderColor: Colors.accent,
  },
  errorText: {
    marginTop: Spacing.xs,
  },
  genderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  genderButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.text,
    backgroundColor: 'transparent',
    minWidth: 120,
    alignItems: 'center',
  },
  genderButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  locationSection: {
    marginTop: Spacing.xl,
    paddingTop: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: 'rgba(31, 41, 55, 0.2)', // Colors.text with opacity
  },
  locationHeader: {
    marginBottom: Spacing.lg,
  },
  locationTitle: {
    marginBottom: Spacing.sm,
  },
  locationControls: {
    gap: Spacing.md,
  },
  locationButton: {
    width: '100%',
  },
  cityInputContainer: {
    marginTop: Spacing.md,
  },
  inputWrapper: {
    position: 'relative',
  },
  inputDisabled: {
    opacity: 0.6,
    backgroundColor: 'rgba(31, 41, 55, 0.05)', // Colors.text with low opacity
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
    textAlign: 'center',
  },
  buttonContainer: {
    marginTop: Spacing.lg,
  },
  button: {
    width: '100%',
  },
});
