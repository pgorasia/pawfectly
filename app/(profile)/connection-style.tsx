import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { ProgressBar } from '@/components/common/ProgressBar';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { useProfileDraft, ConnectionStyle, Gender, Preferences } from '@/hooks/useProfileDraft';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { savePreferencesData, setCurrentStep, updateOnboardingState } from '@/services/supabase/onboardingService';
import { markSubmitted, startValidation, setLastStep, getOrCreateOnboarding } from '@/services/profile/statusRepository';
import { supabase } from '@/services/supabase/supabaseClient';

const CONNECTION_STYLES: {
  emoji: string;
  id: ConnectionStyle;
  title: string;
  description: string;
}[] = [
  {
    emoji: '🐾',
    id: 'pawsome-pals',
    title: 'Pawsome Pals',
    description: 'Let your dog lead the way to new friends',
  },
  {
    emoji: '💛',
    id: 'pawfect-match',
    title: 'Pawfect Match',
    description: 'Find someone who loves your dog as much as you do',
  },
];

const GENDERS: { label: string; value: Gender }[] = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Trans', value: 'trans' },
  { label: 'Non-binary', value: 'non-binary' },
  { label: 'Any', value: 'any' },
];

const CONNECTION_STYLE_LABELS: Record<ConnectionStyle, string> = {
  'pawsome-pals': '🐾 Pawsome Pals',
  'pawfect-match': '💛 Pawfect Match',
};

function PreferencesSection({
  style,
  preferences,
  onUpdate,
}: {
  style: ConnectionStyle;
  preferences: Preferences | null;
  onUpdate: (prefs: Preferences) => void;
}) {
  const [preferredGenders, setPreferredGenders] = useState<Gender[]>(
    preferences?.preferredGenders && preferences.preferredGenders.length > 0
      ? preferences.preferredGenders
      : ['any'] // Default to "Any" for new users
  );
  const [ageMin, setAgeMin] = useState(
    preferences?.ageRange.min?.toString() || ''
  );
  const [ageMax, setAgeMax] = useState(
    preferences?.ageRange.max?.toString() || ''
  );
  const [distance, setDistance] = useState(
    preferences?.distance?.toString() || '25'
  );

  // Initialize with default "Any" if preferences are null/empty
  useEffect(() => {
    if (!preferences || !preferences.preferredGenders || preferences.preferredGenders.length === 0) {
      // Set default to 'any' and notify parent
      setPreferredGenders(['any']);
      onUpdate({
        preferredGenders: ['any'],
        ageRange: {
          min: ageMin ? parseInt(ageMin, 10) : null,
          max: ageMax ? parseInt(ageMax, 10) : null,
        },
        distance: distance ? parseInt(distance, 10) : 25,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  const toggleGender = (gender: Gender) => {
    let newGenders: Gender[];
    
    if (gender === 'any') {
      // If "Any" is selected, clear all other selections and set only "any"
      if (preferredGenders.includes('any')) {
        newGenders = [];
      } else {
        newGenders = ['any'];
      }
    } else {
      // If a specific gender is selected, remove "any" if present
      if (preferredGenders.includes(gender)) {
        newGenders = preferredGenders.filter((g) => g !== gender);
      } else {
        newGenders = preferredGenders.filter((g) => g !== 'any');
        newGenders.push(gender);
      }
    }
    
    setPreferredGenders(newGenders);
    onUpdate({
      preferredGenders: newGenders,
      ageRange: {
        min: ageMin ? parseInt(ageMin, 10) : null,
        max: ageMax ? parseInt(ageMax, 10) : null,
      },
      distance: distance ? parseInt(distance, 10) : 25,
    });
  };

  const updateAgeRange = (field: 'min' | 'max', value: string) => {
    if (field === 'min') {
      setAgeMin(value);
    } else {
      setAgeMax(value);
    }
    onUpdate({
      preferredGenders,
      ageRange: {
        min: field === 'min' ? (value ? parseInt(value, 10) : null) : (ageMin ? parseInt(ageMin, 10) : null),
        max: field === 'max' ? (value ? parseInt(value, 10) : null) : (ageMax ? parseInt(ageMax, 10) : null),
      },
      distance: distance ? parseInt(distance, 10) : 25,
    });
  };

  const updateDistance = (value: string) => {
    setDistance(value);
    onUpdate({
      preferredGenders,
      ageRange: {
        min: ageMin ? parseInt(ageMin, 10) : null,
        max: ageMax ? parseInt(ageMax, 10) : null,
      },
      distance: value ? parseInt(value, 10) : 25,
    });
  };

  return (
    <Card style={styles.preferenceCard}>
      <AppText variant="heading" style={styles.sectionHeader}>
        {CONNECTION_STYLE_LABELS[style]}
      </AppText>

      <View style={styles.section}>
        <AppText variant="body" style={styles.sectionTitle}>
          Preferred Genders
        </AppText>
        <View style={styles.genderGrid}>
          {GENDERS.map((option) => {
            const isSelected = preferredGenders.includes(option.value);
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.genderButton,
                  isSelected && styles.genderButtonSelected,
                ]}
                onPress={() => toggleGender(option.value)}
              >
                <AppText
                  variant="caption"
                  color={isSelected ? 'background' : 'text'}
                >
                  {option.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="body" style={styles.sectionTitle}>
          Age Range
        </AppText>
        <View style={styles.ageRangeRow}>
          <View style={styles.ageInputContainer}>
            <AppText variant="caption" style={styles.ageLabel}>
              Min Age
            </AppText>
            <TextInput
              style={styles.ageInput}
              value={ageMin}
              onChangeText={(value) => updateAgeRange('min', value)}
              placeholder="18"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.ageInputContainer}>
            <AppText variant="caption" style={styles.ageLabel}>
              Max Age
            </AppText>
            <TextInput
              style={styles.ageInput}
              value={ageMax}
              onChangeText={(value) => updateAgeRange('max', value)}
              placeholder="99"
              keyboardType="numeric"
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="body" style={styles.sectionTitle}>
          Distance Preference
        </AppText>
        <AppText variant="caption" style={styles.distanceDescription}>
          Preferred distance: {distance} miles
        </AppText>
        <View style={styles.distanceRow}>
          <TextInput
            style={styles.distanceInput}
            value={distance}
            onChangeText={updateDistance}
            placeholder="25"
            keyboardType="numeric"
          />
          <AppText variant="body" style={styles.distanceUnit}>
            miles
          </AppText>
        </View>
        <AppText variant="caption" style={styles.distanceNote}>
          This is a preference, not a hard limit
        </AppText>
      </View>
    </Card>
  );
}

export default function ConnectionStyleScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { draft, updateConnectionStyles, updatePreferences } = useProfileDraft();
  const [selectedStyles, setSelectedStyles] = useState<ConnectionStyle[]>(
    draft.connectionStyles || []
  );

  // Set current step when page loads or when user navigates back to this screen
  // Only update onboarding_status if lifecycle_status is 'onboarding' (or profile doesn't exist yet - new user)
  useFocusEffect(
    React.useCallback(() => {
      if (user?.id) {
        // Check lifecycle_status before updating onboarding_status
        supabase
          .from('profiles')
          .select('lifecycle_status')
          .eq('user_id', user.id)
          .maybeSingle()
          .then(({ data: profile, error }) => {
            if (error && error.code !== 'PGRST116') {
              console.error('[ConnectionStyleScreen] Failed to check lifecycle_status:', error);
              return;
            }
            
            // If profile doesn't exist (new user) or lifecycle_status is 'onboarding', update onboarding_status
            if (!profile || profile.lifecycle_status === 'onboarding') {
              // First ensure the row exists, then set the step
              getOrCreateOnboarding(user.id)
                .then(() => setLastStep(user.id, 'preferences'))
                .catch((error) => {
                  console.error('[ConnectionStyleScreen] Failed to set current step:', error);
                });
            } else {
              console.log(
                `[ConnectionStyleScreen] Skipping onboarding_status update - lifecycle_status is '${profile.lifecycle_status}', not 'onboarding'`
              );
            }
          });
      }
    }, [user?.id])
  );

  const toggleStyle = (style: ConnectionStyle) => {
    const newStyles = selectedStyles.includes(style)
      ? selectedStyles.filter((s) => s !== style)
      : [...selectedStyles, style];
    setSelectedStyles(newStyles);
    updateConnectionStyles(newStyles);
  };

  const handleUpdatePreferences = (style: ConnectionStyle, prefs: Preferences) => {
    updatePreferences(style, prefs);
  };

  const handleContinue = async () => {
    if (!user?.id) return;

    try {
      // Save preferences draft (fire-and-forget autosave)
      savePreferencesData(user.id, selectedStyles, draft.preferences).catch((error) => {
        console.error('[ConnectionStyleScreen] Failed to save preferences data:', error);
        // Don't block navigation on error
      });

      // Mark preferences as submitted (sets last_step='done')
      await markSubmitted(user.id, 'preferences');

      // Start validation process (sets profile to pending_review/in_progress and returns runId)
      const validationRunId = await startValidation(user.id);

      // Trigger profile validation edge function
      // This validates all photos and calls applyValidationResult with runId guard
      try {
        const { supabase } = await import('@/services/supabase/supabaseClient');
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.access_token) {
          const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
          if (!supabaseUrl) {
            console.error('[ConnectionStyleScreen] EXPO_PUBLIC_SUPABASE_URL not set');
          } else {
            const response = await fetch(`${supabaseUrl}/functions/v1/validate-profile`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                user_id: user.id,
                validation_run_id: validationRunId,
              }),
            });

            if (!response.ok) {
              console.error('[ConnectionStyleScreen] Validation job failed:', await response.text());
            } else {
              console.log('[ConnectionStyleScreen] Validation job completed:', await response.json());
            }
          }
        }
      } catch (error) {
        console.error('[ConnectionStyleScreen] Failed to trigger validation job:', error);
        // Don't block navigation - validation can run asynchronously
      }

      // Route user to /(tabs) immediately (user can still access app while pending review)
      router.replace('/(tabs)');
    } catch (error) {
      console.error('[ConnectionStyleScreen] Failed to start exploring:', error);
      // Don't block navigation on error - user can retry later
      router.replace('/(tabs)');
    }
  };

  const canContinue = selectedStyles.length > 0;

  return (
    <ScreenContainer>
      <ProgressBar
        currentStep={4}
        totalSteps={4}
        stepTitles={['Your Pack', 'Little about you', 'Photos', 'Preferences']}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              onPress={() => router.push('/(profile)/photos')}
              style={styles.backButton}
            >
              <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <AppText variant="heading" style={styles.title}>
            How would you like to connect?
          </AppText>
          <AppText variant="body" style={styles.subtitle}>
            All connections are dog-approved first.
          </AppText>
        </View>

        <View style={styles.options}>
          {CONNECTION_STYLES.map((style) => {
            const isSelected = selectedStyles.includes(style.id);
            return (
              <TouchableOpacity
                key={style.id}
                style={[
                  styles.optionCard,
                  isSelected && styles.optionCardSelected,
                ]}
                onPress={() => toggleStyle(style.id)}
              >
                <Card style={styles.cardContent}>
                  <View style={styles.optionHeader}>
                    <AppText variant="heading" style={styles.emoji}>
                      {style.emoji}
                    </AppText>
                    <View style={styles.optionText}>
                      <AppText variant="body" style={styles.optionTitle}>
                        {style.title}
                      </AppText>
                      <AppText variant="caption" style={styles.optionDescription}>
                        {style.description}
                      </AppText>
                    </View>
                    <View style={styles.checkboxContainer}>
                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                        {isSelected && (
                          <AppText variant="body" style={styles.checkmark}>
                            ✓
                          </AppText>
                        )}
                      </View>
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>

        <AppText variant="caption" style={styles.changeLaterText}>
          You can always change this later
        </AppText>

        {selectedStyles.length === 0 && (
          <AppText variant="caption" color={Colors.accent} style={styles.errorText}>
            Please select at least one connection style
          </AppText>
        )}

        {selectedStyles.includes('pawsome-pals') && (
          <PreferencesSection
            style="pawsome-pals"
            preferences={draft.preferences['pawsome-pals']}
            onUpdate={(prefs) => handleUpdatePreferences('pawsome-pals', prefs)}
          />
        )}

        {selectedStyles.includes('pawfect-match') && (
          <PreferencesSection
            style="pawfect-match"
            preferences={draft.preferences['pawfect-match']}
            onUpdate={(prefs) => handleUpdatePreferences('pawfect-match', prefs)}
          />
        )}

        <View style={styles.buttonContainer}>
          <AppButton
            variant="primary"
            onPress={handleContinue}
            disabled={!canContinue}
            style={styles.button}
          >
            Start exploring
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
  options: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  optionCard: {
    marginBottom: Spacing.sm,
  },
  optionCardSelected: {
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 12,
  },
  cardContent: {
    padding: Spacing.lg,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 32,
    marginRight: Spacing.md,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  optionDescription: {
    opacity: 0.7,
  },
  checkboxContainer: {
    marginLeft: Spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.text,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkmark: {
    color: Colors.background,
    fontSize: 14,
    fontWeight: 'bold',
  },
  changeLaterText: {
    textAlign: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    opacity: 0.6,
    fontStyle: 'italic',
  },
  errorText: {
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  preferenceCard: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  genderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  genderButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.text,
    backgroundColor: 'transparent',
  },
  genderButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  ageRangeRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  ageInputContainer: {
    flex: 1,
  },
  ageLabel: {
    marginBottom: Spacing.xs,
    opacity: 0.7,
  },
  ageInput: {
    borderWidth: 1,
    borderColor: Colors.text,
    borderRadius: 8,
    padding: Spacing.md,
    fontSize: 16,
    minHeight: 44,
  },
  distanceDescription: {
    marginBottom: Spacing.sm,
    opacity: 0.7,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  distanceInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.text,
    borderRadius: 8,
    padding: Spacing.md,
    fontSize: 16,
    minHeight: 44,
  },
  distanceUnit: {
    opacity: 0.7,
  },
  distanceNote: {
    marginTop: Spacing.xs,
    opacity: 0.6,
    fontStyle: 'italic',
  },
  buttonContainer: {
    marginTop: Spacing.lg,
  },
  button: {
    width: '100%',
  },
});
