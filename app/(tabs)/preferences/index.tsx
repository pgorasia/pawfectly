import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { useProfileDraft, Gender, Preferences, ConnectionStyle } from '@/hooks/useProfileDraft';
import { useAuth } from '@/contexts/AuthContext';
import { useMe } from '@/contexts/MeContext';
import { updatePreferencesData } from '@/services/supabase/onboardingService';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';

type PreferencesTab = 'pawsome-pals' | 'pawfect-match';

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

export default function PreferencesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const { user } = useAuth();
  const { me, updateMe } = useMe();
  const { draft, updateConnectionStyles, updatePreferences } = useProfileDraft();
  const [selectedStyles, setSelectedStyles] = useState<ConnectionStyle[]>(
    draft.connectionStyles || []
  );
  const [activeTab, setActiveTab] = useState<PreferencesTab>('pawsome-pals');
  const isEditMode = me.profile?.lifecycle_status === 'active';
  const hasUnsavedChanges = useRef(false);
  const isSaving = useRef(false); // Prevent duplicate saves
  
  // Use refs to capture latest values without triggering re-renders
  const selectedStylesRef = useRef(selectedStyles);
  const preferencesRef = useRef(draft.preferences);
  
  // Update refs when values change
  useEffect(() => {
    selectedStylesRef.current = selectedStyles;
    preferencesRef.current = draft.preferences;
  }, [selectedStyles, draft.preferences]);
  
  // Set initial active tab based on selected styles
  useEffect(() => {
    if (selectedStyles.length > 0) {
      if (selectedStyles.includes('pawsome-pals')) {
        setActiveTab('pawsome-pals');
      } else if (selectedStyles.includes('pawfect-match')) {
        setActiveTab('pawfect-match');
      }
    }
  }, [selectedStyles]);

  const toggleStyle = (style: ConnectionStyle) => {
    const newStyles = selectedStyles.includes(style)
      ? selectedStyles.filter((s) => s !== style)
      : [...selectedStyles, style];
    setSelectedStyles(newStyles);
    updateConnectionStyles(newStyles);
    hasUnsavedChanges.current = true;
  };

  const handleUpdatePreferences = (style: ConnectionStyle, prefs: Preferences) => {
    updatePreferences(style, prefs);
    hasUnsavedChanges.current = true;
  };

  const canSave = selectedStyles.length > 0;

  // Save function - only called when navigating away
  // Uses refs to avoid recreating the callback on every change
  const savePreferences = useCallback(async () => {
    const currentStyles = selectedStylesRef.current;
    const currentPrefs = preferencesRef.current;
    
    // Prevent duplicate saves
    if (isSaving.current || !user?.id || !hasUnsavedChanges.current || currentStyles.length === 0) {
      return;
    }
    
    isSaving.current = true;
    console.log('[PreferencesScreen] 💾 Saving preferences to database...', {
      selectedStyles: currentStyles,
      palsEnabled: currentStyles.includes('pawsome-pals'),
      matchEnabled: currentStyles.includes('pawfect-match'),
    });
    
    try {
      // Update MeContext optimistically (server cache)
      updateMe({
        connectionStyles: currentStyles,
        preferences: currentPrefs,
        preferencesRaw: {
          pals_enabled: currentStyles.includes('pawsome-pals'),
          match_enabled: currentStyles.includes('pawfect-match'),
        },
      });

      // Save to database (batch all changes)
      await updatePreferencesData(user.id, currentStyles, currentPrefs);
      
      hasUnsavedChanges.current = false;
      console.log('[PreferencesScreen] ✅ Preferences saved successfully');
    } catch (error) {
      console.error('[PreferencesScreen] ❌ Failed to save preferences:', error);
    } finally {
      isSaving.current = false;
    }
  }, [user?.id, updateMe]);

  // Save when navigating away from the screen
  useFocusEffect(
    useCallback(() => {
      // On focus: reset saving flag
      isSaving.current = false;
      
      // On blur (navigating away): save all changes
      return () => {
        savePreferences();
      };
    }, [savePreferences])
  );

  const handleSave = async () => {
    await savePreferences();
    router.back();
  };

  const handleBack = () => {
    if (params.from === 'account') {
      router.push('/(tabs)/account');
    } else if (params.from === 'feed') {
      router.push('/(tabs)');
    } else {
      router.back();
    }
  };

  return (
    <ScreenContainer edges={['top']}>
      {isEditMode && (
        <View style={styles.backButtonContainer}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>
      )}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <AppText variant="heading" style={styles.title}>
            How would you like to connect?
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

        {me.profile?.lifecycle_status !== 'active' && (
          <AppText variant="caption" style={styles.changeLaterText}>
            You can always change this later
          </AppText>
        )}

        {selectedStyles.length === 0 && (
          <AppText variant="caption" color={Colors.accent} style={styles.errorText}>
            Please select at least one connection style
          </AppText>
        )}

        {/* Tabs for preferences */}
        {selectedStyles.length > 0 && (
          <View style={styles.tabsContainer}>
            <View style={styles.tabBar}>
              {selectedStyles.includes('pawsome-pals') && (
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'pawsome-pals' && styles.tabActive]}
                  onPress={() => setActiveTab('pawsome-pals')}
                >
                  <AppText
                    variant="body"
                    style={[styles.tabText, activeTab === 'pawsome-pals' && styles.tabTextActive]}
                  >
                    🐾 Pawsome Pals
                  </AppText>
                </TouchableOpacity>
              )}
              {selectedStyles.includes('pawfect-match') && (
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'pawfect-match' && styles.tabActive]}
                  onPress={() => setActiveTab('pawfect-match')}
                >
                  <AppText
                    variant="body"
                    style={[styles.tabText, activeTab === 'pawfect-match' && styles.tabTextActive]}
                  >
                    💛 Pawfect Match
                  </AppText>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.tabContent}>
              {activeTab === 'pawsome-pals' && selectedStyles.includes('pawsome-pals') && (
                <PreferencesSection
                  style="pawsome-pals"
                  preferences={draft.preferences['pawsome-pals']}
                  onUpdate={(prefs) => handleUpdatePreferences('pawsome-pals', prefs)}
                />
              )}

              {activeTab === 'pawfect-match' && selectedStyles.includes('pawfect-match') && (
                <PreferencesSection
                  style="pawfect-match"
                  preferences={draft.preferences['pawfect-match']}
                  onUpdate={(prefs) => handleUpdatePreferences('pawfect-match', prefs)}
                />
              )}
            </View>
          </View>
        )}

        {!isEditMode && (
          <View style={styles.buttonContainer}>
            <AppButton
              variant="primary"
              onPress={handleSave}
              disabled={!canSave}
              style={styles.button}
            >
              Save
            </AppButton>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  backButtonContainer: {
    padding: Spacing.md,
    paddingTop: Spacing.lg,
  },
  backButton: {
    padding: Spacing.sm,
    marginLeft: -Spacing.sm,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.lg,
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
  tabsContainer: {
    marginTop: Spacing.lg,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    opacity: 0.5,
  },
  tabTextActive: {
    opacity: 1,
    fontWeight: '600',
    color: Colors.primary,
  },
  tabContent: {
    minHeight: 200,
  },
});
