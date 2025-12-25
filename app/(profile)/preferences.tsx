import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { useProfileDraft, Gender, Preferences, ConnectionStyle } from '@/hooks/useProfileDraft';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';

const GENDERS: { label: string; value: Gender }[] = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Trans', value: 'trans' },
  { label: 'Non-binary', value: 'non-binary' },
  { label: 'Self-described', value: 'self-described' },
  { label: 'Prefer not to say', value: 'prefer-not-to-say' },
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
    preferences?.preferredGenders || []
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

  const toggleGender = (gender: Gender) => {
    const newGenders = preferredGenders.includes(gender)
      ? preferredGenders.filter((g) => g !== gender)
      : [...preferredGenders, gender];
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

export default function PreferencesScreen() {
  const router = useRouter();
  const { draft, updatePreferences } = useProfileDraft();
  const hasPawsomePals = draft.connectionStyles.includes('pawsome-pals');
  const hasPawfectMatch = draft.connectionStyles.includes('pawfect-match');

  const handleUpdatePreferences = (style: ConnectionStyle, prefs: Preferences) => {
    updatePreferences(style, prefs);
  };

  const handleContinue = () => {
    // If coming from account page, go back; otherwise go to tabs
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push('/(tabs)');
    }
  };

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <AppText variant="heading" style={styles.title}>
            Your Preferences
          </AppText>
          <AppText variant="body" style={styles.subtitle}>
            Set your preferences for each connection type (you can change these later)
          </AppText>
        </View>

        {hasPawsomePals && (
          <PreferencesSection
            style="pawsome-pals"
            preferences={draft.preferences['pawsome-pals']}
            onUpdate={(prefs) => handleUpdatePreferences('pawsome-pals', prefs)}
          />
        )}

        {hasPawfectMatch && (
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
            style={styles.button}
          >
            {router.canGoBack() ? 'Save' : 'Start exploring'}
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
