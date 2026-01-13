/**
 * FullProfileView Component
 * Displays a complete profile in Hinge-style format with hero photo, compatibility, dogs, prompts, and photos
 */

import React, { useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import type { ProfileViewPayload } from '@/types/feed';
import { buildHeroPhotoUrl } from '@/services/feed/feedService';
import { supabase } from '@/services/supabase/supabaseClient';
import { useMe } from '@/contexts/MeContext';

interface FullProfileViewProps {
  payload: ProfileViewPayload;
  onHeartPress?: (source: { type: 'photo' | 'prompt'; refId: string }) => void;
  hasScrolledPastHero?: boolean;
  readOnly?: boolean;
  onMorePress?: () => void; // Callback for (...) icon press on hero photo
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = SCREEN_WIDTH * 1.2; // Tall hero image

export const FullProfileView: React.FC<FullProfileViewProps> = ({
  payload,
  onHeartPress,
  hasScrolledPastHero = false,
  readOnly = false,
  onMorePress,
}) => {
  const { me } = useMe();

  // Build hero photo URL
  const heroPhotoUrl = useMemo(() => {
    if (!payload.hero_photo) return null;
    return buildHeroPhotoUrl(
      payload.hero_photo.bucket_type,
      payload.hero_photo.storage_path
    );
  }, [payload.hero_photo]);

  // Order dogs: best match first if exists, then by slot
  const orderedDogs = useMemo(() => {
    const dogs = [...payload.dogs];
    if (payload.compatibility.best_pair) {
      const bestMatchSlot = payload.compatibility.best_pair.candidate_dog_slot;
      const bestMatchIndex = dogs.findIndex((d) => d.slot === bestMatchSlot);
      if (bestMatchIndex > 0) {
        const [bestMatch] = dogs.splice(bestMatchIndex, 1);
        return [bestMatch, ...dogs];
      }
    }
    return dogs.sort((a, b) => a.slot - b.slot);
  }, [payload.dogs, payload.compatibility.best_pair]);

  // Group photos by dog slot and bucket type
  const photosByDogSlot = useMemo(() => {
    const map = new Map<number, typeof payload.photos>();
    payload.photos.forEach((photo) => {
      if (photo.bucket_type === 'dog' && photo.dog_slot !== null) {
        if (!map.has(photo.dog_slot)) {
          map.set(photo.dog_slot, []);
        }
        map.get(photo.dog_slot)!.push(photo);
      }
    });
    return map;
  }, [payload.photos]);

  const humanPhotos = useMemo(() => {
    return payload.photos.filter((p) => p.bucket_type === 'human');
  }, [payload.photos]);

  // Group prompts by dog slot
  const promptsByDogSlot = useMemo(() => {
    const map = new Map<number, typeof payload.prompts>();
    payload.prompts.forEach((prompt) => {
      // Only include prompts with valid prompt_text and dog_slot
      if (prompt.prompt_text && prompt.dog_slot !== null) {
        if (!map.has(prompt.dog_slot)) {
          map.set(prompt.dog_slot, []);
        }
        map.get(prompt.dog_slot)!.push(prompt);
      }
    });
    return map;
  }, [payload.prompts]);

  // Build photo URLs
  const photoUrls = useMemo(() => {
    const urlMap = new Map<string, string | null>();
    payload.photos.forEach((photo) => {
      const { data } = supabase.storage
        .from('photos')
        .getPublicUrl(photo.storage_path);
      urlMap.set(photo.id, data?.publicUrl || null);
    });
    return urlMap;
  }, [payload.photos]);

  // Get all dog names for hero label
  const allDogNames = useMemo(() => {
    return payload.dogs.map(d => d.name).join(', ');
  }, [payload.dogs]);

  // Get human first name
  const humanFirstName = useMemo(() => {
    const displayName = payload.candidate.display_name || '';
    return displayName.split(' ')[0] || displayName;
  }, [payload.candidate.display_name]);

  // Get best match dog name for compatibility tier on hero
  const bestMatchDogName = useMemo(() => {
    if (payload.compatibility.best_pair) {
      const bestMatchDog = payload.dogs.find(
        d => d.slot === payload.compatibility.best_pair!.candidate_dog_slot
      );
      return bestMatchDog?.name || null;
    }
    return null;
  }, [payload.dogs, payload.compatibility.best_pair]);

  // Get compatibility label for a dog pair
  const getCompatibilityLabel = (tier: string | null, score: number | null) => {
    if (tier && score !== null) {
      return `${tier} · ${score}%`;
    }
    if (score !== null) {
      return `${score}% match`;
    }
    return null;
  };

  return (
    <View>
      {/* Hero Photo Section */}
      <View key="hero" style={styles.heroContainer}>
        {heroPhotoUrl ? (
          <Image
            source={{ uri: heroPhotoUrl }}
            style={styles.heroImage}
            contentFit="cover"
            cachePolicy="disk"
          />
        ) : (
          <View style={[styles.heroImage, styles.heroPlaceholder]}>
            <AppText variant="body" style={styles.placeholderText}>
              Photos under review
            </AppText>
          </View>
        )}
        
        {/* Hero Overlay Gradient */}
        <View style={styles.heroOverlayGradient} />
        
        {/* More button (...) - Top Right */}
        {onMorePress && (
          <TouchableOpacity
            style={styles.heroMoreButton}
            onPress={onMorePress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="more-vert" size={24} color={Colors.background} />
          </TouchableOpacity>
        )}
        
        {/* Hero Overlay Content - Bottom Left */}
        <View style={styles.heroOverlay}>
          <View style={styles.heroContent}>
            {/* Dog names (all dogs) */}
            <AppText key="dog-names" variant="heading" style={styles.heroDogName}>
              {allDogNames || payload.labels.dog_label}
            </AppText>
            
            {/* Human first name (secondary, smaller) */}
            <AppText key="human-name" variant="body" style={styles.heroHumanName}>
              {humanFirstName}
            </AppText>
            
            {/* Distance and verification row */}
            <View style={styles.heroMetaRow}>
              {payload.labels.distance_miles !== null && (
                <AppText key="distance" variant="caption" style={styles.heroDistance}>
                  {payload.labels.distance_miles.toFixed(1)} mi
                </AppText>
              )}
              {payload.labels.is_verified && (
                <View key="verified-badge" style={styles.verifiedBadge}>
                  <MaterialIcons name="verified" size={16} color={Colors.primary} />
                </View>
              )}
            </View>
            
            {/* Compatibility tier for best match dog */}
            {payload.compatibility.tier && bestMatchDogName && (
              <View key="hero-compatibility" style={styles.heroCompatibility}>
                <AppText variant="caption" style={styles.heroCompatibilityText}>
                  {payload.compatibility.tier}
                </AppText>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Compatibility Details (revealed after scroll) */}
      {hasScrolledPastHero && payload.compatibility.tier && payload.compatibility.score !== null && (
        <Card key="compatibility" style={styles.compatibilityCard}>
          {/* Per-dog-pair compatibility (best pair shown first) */}
          {payload.compatibility.best_pair && (() => {
            const candidateDog = payload.dogs.find(
              d => d.slot === payload.compatibility.best_pair!.candidate_dog_slot
            );
            const viewerDog = me.dogs.find(
              d => d.slot === payload.compatibility.best_pair!.viewer_dog_slot
            );
            if (candidateDog && payload.compatibility.tier && payload.compatibility.score !== null) {
              const dogPairLabel = viewerDog 
                ? `${viewerDog.name} ↔ ${candidateDog.name} — ${getCompatibilityLabel(payload.compatibility.tier, payload.compatibility.score)}`
                : `${candidateDog.name} — ${getCompatibilityLabel(payload.compatibility.tier, payload.compatibility.score)}`;
              
              return (
                <View key={`pair-${candidateDog.id}`} style={styles.dogPairItem}>
                  <AppText variant="heading" style={styles.dogPairLabel}>
                    {dogPairLabel}
                  </AppText>
                  {payload.compatibility.why.length > 0 && (
                    <React.Fragment key="why-matched">
                      <AppText key="why-title" variant="body" style={styles.compatibilitySubtitle}>
                        Why we matched
                      </AppText>
                      <View key="why-reasons" style={styles.compatibilityReasons}>
                        {payload.compatibility.why.map((reason, index) => (
                          <View key={`reason-${index}`} style={styles.reasonItem}>
                            <AppText variant="body" style={styles.reasonText}>
                              • {reason}
                            </AppText>
                          </View>
                        ))}
                      </View>
                    </React.Fragment>
                  )}
                </View>
              );
            }
            return null;
          })()}
          
          {/* If no best_pair, show overall compatibility */}
          {!payload.compatibility.best_pair && (
            <View key="overall-compatibility" style={styles.compatibilitySection}>
              <AppText variant="heading" style={styles.compatibilityTitle}>
                {getCompatibilityLabel(payload.compatibility.tier, payload.compatibility.score)}
              </AppText>
              {payload.compatibility.why.length > 0 && (
                <React.Fragment key="why-matched-overall">
                  <AppText key="why-title-overall" variant="body" style={styles.compatibilitySubtitle}>
                    Why we matched
                  </AppText>
                  <View key="why-reasons-overall" style={styles.compatibilityReasons}>
                    {payload.compatibility.why.map((reason, index) => (
                      <View key={`reason-overall-${index}`} style={styles.reasonItem}>
                        <AppText variant="body" style={styles.reasonText}>
                          • {reason}
                        </AppText>
                      </View>
                    ))}
                  </View>
                </React.Fragment>
              )}
            </View>
          )}
        </Card>
      )}

      {/* Dog Sections */}
      {orderedDogs.map((dog) => {
        const dogPhotos = photosByDogSlot.get(dog.slot) || [];
        const dogPrompts = promptsByDogSlot.get(dog.slot) || [];
        
        // Interleave prompts with photos (simple: show first photo, then prompts, then remaining photos)
        const firstPhoto = dogPhotos[0];
        const remainingPhotos = dogPhotos.slice(1);
        
        return (
          <View key={dog.id} style={styles.dogSection}>
            {/* First dog photo */}
            {firstPhoto && (
              <PhotoTile
                key={`photo-${firstPhoto.id}`}
                photo={firstPhoto}
                photoUrl={photoUrls.get(firstPhoto.id) || null}
                onHeartPress={readOnly ? undefined : () => onHeartPress?.({ type: 'photo', refId: firstPhoto.id })}
              />
            )}

            {/* Dog Details */}
            <Card key={`dog-card-${dog.id}`} style={styles.dogCard}>
              <AppText variant="heading" style={styles.dogName}>
                {dog.name}
              </AppText>
              <View style={styles.dogDetails}>
                {dog.breed && (
                  <View key="breed" style={styles.dogDetailRow}>
                    <AppText variant="body" style={styles.dogLabel}>
                      Breed
                    </AppText>
                    <AppText variant="body" style={styles.dogValue}>
                      {dog.breed}
                    </AppText>
                  </View>
                )}
                {dog.age_group && (
                  <View key="age-group" style={styles.dogDetailRow}>
                    <AppText variant="body" style={styles.dogLabel}>
                      Age Group
                    </AppText>
                    <AppText variant="body" style={styles.dogValue}>
                      {dog.age_group}
                    </AppText>
                  </View>
                )}
                <View key="size" style={styles.dogDetailRow}>
                  <AppText variant="body" style={styles.dogLabel}>
                    Size
                  </AppText>
                  <AppText variant="body" style={styles.dogValue}>
                    {dog.size || 'Not set'}
                  </AppText>
                </View>
                <View key="energy" style={styles.dogDetailRow}>
                  <AppText variant="body" style={styles.dogLabel}>
                    Energy Level
                  </AppText>
                  <AppText variant="body" style={styles.dogValue}>
                    {dog.energy || 'Not set'}
                  </AppText>
                </View>
                {dog.play_styles && dog.play_styles.length > 0 && (
                  <View key="play-styles" style={styles.dogDetailRow}>
                    <AppText variant="body" style={styles.dogLabel}>
                      Play Style
                    </AppText>
                    <AppText variant="body" style={styles.dogValue}>
                      {dog.play_styles.join(', ')}
                    </AppText>
                  </View>
                )}
                {dog.temperament && (
                  <View key="temperament" style={styles.dogDetailRow}>
                    <AppText variant="body" style={styles.dogLabel}>
                      Temperament
                    </AppText>
                    <AppText variant="body" style={styles.dogValue}>
                      {dog.temperament}
                    </AppText>
                  </View>
                )}
              </View>
            </Card>

            {/* Prompts (after details) */}
            {dogPrompts.map((prompt) => (
              <PromptTile
                key={prompt.id}
                prompt={prompt}
                onHeartPress={readOnly ? undefined : () => onHeartPress?.({ type: 'prompt', refId: prompt.id })}
              />
            ))}

            {/* Remaining dog photos (after prompts) */}
            {remainingPhotos.map((photo) => (
              <PhotoTile
                key={photo.id}
                photo={photo}
                photoUrl={photoUrls.get(photo.id) || null}
                onHeartPress={readOnly ? undefined : () => onHeartPress?.({ type: 'photo', refId: photo.id })}
              />
            ))}
          </View>
        );
      })}

      {/* Human Photos Section */}
      {humanPhotos.length > 0 && (
        <View key="human-photos-section" style={styles.humanSection}>
          <Card key="human-photos-header" style={styles.sectionHeader}>
            <AppText variant="heading" style={styles.sectionTitle}>
              More Photos
            </AppText>
          </Card>
          {humanPhotos.map((photo) => (
          <PhotoTile
            key={photo.id}
            photo={photo}
            photoUrl={photoUrls.get(photo.id) || null}
            onHeartPress={readOnly ? undefined : () => onHeartPress?.({ type: 'photo', refId: photo.id })}
          />
          ))}
        </View>
      )}

      {/* Bottom padding for action bar */}
      <View key="bottom-padding" style={styles.bottomPadding} />
    </View>
  );
};

// Photo Tile Component
interface PhotoTileProps {
  photo: ProfileViewPayload['photos'][0];
  photoUrl: string | null;
  onHeartPress?: () => void;
}

const PhotoTile: React.FC<PhotoTileProps> = ({ photo, photoUrl, onHeartPress }) => {
  return (
    <View style={styles.photoTile}>
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={styles.photoImage}
          contentFit="cover"
          cachePolicy="disk"
        />
      ) : (
        <View style={[styles.photoImage, styles.photoPlaceholder]}>
          <AppText variant="caption">Loading...</AppText>
        </View>
      )}
      {onHeartPress && (
        <TouchableOpacity
          style={styles.heartButton}
          onPress={onHeartPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="favorite-border" size={24} color={Colors.background} />
        </TouchableOpacity>
      )}
    </View>
  );
};

// Prompt Tile Component
interface PromptTileProps {
  prompt: ProfileViewPayload['prompts'][0];
  onHeartPress?: () => void;
}

const PromptTile: React.FC<PromptTileProps> = ({ prompt, onHeartPress }) => {
  // Only render if we have prompt text and response text
  if (!prompt.prompt_text || !prompt.response_text) {
    return null;
  }

  return (
    <Card style={styles.promptCard}>
      <View style={styles.promptContent}>
        <AppText variant="body" style={styles.promptQuestion}>
          {prompt.prompt_text}
        </AppText>
        <AppText variant="body" style={styles.promptAnswer}>
          {prompt.response_text}
        </AppText>
      </View>
      {onHeartPress && (
        <TouchableOpacity
          style={styles.promptHeartButton}
          onPress={onHeartPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="favorite-border" size={20} color={Colors.primary} />
        </TouchableOpacity>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  heroContainer: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    backgroundColor: Colors.text + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: Colors.text,
    opacity: 0.6,
  },
  heroOverlayGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  heroMoreButton: {
    position: 'absolute',
    top: Spacing.lg,
    right: Spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    alignItems: 'flex-start',
  },
  heroContent: {
    gap: Spacing.xs,
    alignItems: 'flex-start',
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  heroDogName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.background,
  },
  heroHumanName: {
    fontSize: 20,
    color: Colors.background,
    opacity: 0.85,
  },
  heroDistance: {
    color: Colors.background,
    opacity: 0.8,
  },
  verifiedBadge: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 4,
  },
  heroCompatibility: {
    backgroundColor: Colors.primary + 'CC',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 16,
    marginTop: Spacing.xs,
  },
  heroCompatibilityText: {
    color: Colors.background,
    fontWeight: '600',
    fontSize: 12,
  },
  compatibilityCard: {
    margin: Spacing.lg,
    marginTop: Spacing.xl,
  },
  compatibilitySection: {
    marginBottom: Spacing.lg,
  },
  compatibilityTitle: {
    marginBottom: Spacing.sm,
    fontSize: 24,
  },
  compatibilitySubtitle: {
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    opacity: 0.7,
    fontWeight: '600',
  },
  compatibilityReasons: {
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  reasonItem: {
    marginLeft: Spacing.sm,
  },
  reasonText: {
    opacity: 0.8,
    lineHeight: 22,
  },
  dogPairCompatibility: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.text + '20',
  },
  dogPairItem: {
    marginBottom: Spacing.md,
  },
  dogPairLabel: {
    fontWeight: '600',
    marginBottom: Spacing.sm,
    fontSize: 18,
  },
  dogSection: {
    marginBottom: Spacing.xl,
  },
  dogCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  dogName: {
    marginBottom: Spacing.sm,
  },
  dogDetails: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  dogDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  dogLabel: {
    fontWeight: '600',
    opacity: 0.7,
    minWidth: 100,
  },
  dogValue: {
    flex: 1,
    textAlign: 'right',
    opacity: 0.9,
  },
  photoTile: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    position: 'relative',
    marginBottom: Spacing.sm,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    backgroundColor: Colors.text + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartButton: {
    position: 'absolute',
    bottom: Spacing.md,
    right: Spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  promptCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    position: 'relative',
    padding: Spacing.md,
    paddingRight: Spacing.xl + 32, // Extra padding on right for heart button
    paddingBottom: Spacing.lg,
    minHeight: 80,
  },
  promptContent: {
    flex: 1,
  },
  promptQuestion: {
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  promptAnswer: {
    opacity: 0.8,
    lineHeight: 20,
  },
  promptHeartButton: {
    position: 'absolute',
    bottom: Spacing.md,
    right: Spacing.md,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  humanSection: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 24,
  },
  bottomPadding: {
    height: 120, // Space for fixed action bar
  },
});
