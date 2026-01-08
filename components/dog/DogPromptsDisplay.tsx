/**
 * Dog Prompts Display Component (Read-only)
 * Displays prompts for a dog in read-only mode
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { getPromptQuestions, parsePromptQuestion, type PromptQuestion } from '@/services/prompts/promptService';
import type { DogProfile } from '@/hooks/useProfileDraft';

interface DogPromptsDisplayProps {
  dog: DogProfile;
}

export function DogPromptsDisplay({ dog }: DogPromptsDisplayProps) {
  const [prompts, setPrompts] = useState<PromptQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  // Load prompt questions (for parsing question text, cached so fast)
  // Pre-loaded in TabLayout bootstrap, so this should be instant if cache is warm
  useEffect(() => {
    getPromptQuestions()
      .then((loadedPrompts) => {
        setPrompts(loadedPrompts);
        setLoading(false);
      })
      .catch((error) => {
        console.error('[DogPromptsDisplay] Failed to load prompt questions:', error);
        setLoading(false);
      });
  }, []);

  // Use prompts from dog object (part of cached "My Pack" payload)
  const dogPrompts = dog.prompts || [];

  // Replace "my dog" with dog's name in question text
  const personalizeQuestion = (questionText: string): string => {
    if (dog.name && dog.name.trim()) {
      const dogName = dog.name.trim();
      // Replace "my dog" with the dog's name (case insensitive)
      return questionText.replace(/my dog/gi, dogName);
    }
    return questionText;
  };

  // Get prompt question details
  const getPromptQuestion = (promptQuestionId: string): PromptQuestion | undefined => {
    return prompts.find(p => p.id === promptQuestionId);
  };

  if (dogPrompts.length === 0) {
    return null;
  }

  // Show nothing while loading (prompts are pre-loaded in bootstrap, so this should be very brief)
  if (loading || prompts.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <AppText variant="body" style={styles.label}>
        Personality Prompts
      </AppText>
      {dogPrompts.map((prompt) => {
        const question = getPromptQuestion(prompt.prompt_question_id);
        const parsed = question ? parsePromptQuestion(question) : null;
        // Extract just the question part (before the colon and suggestions)
        const questionText = parsed ? parsed.question : null;
        // If we can't parse, try to extract from question_text if available
        // For now, we'll need the question text - but prompts in dog object don't have question_text
        // We'll need to get it from the prompts array
        let displayQuestion = questionText;
        if (!displayQuestion && question) {
          displayQuestion = question.question_text;
        }
        
        if (!displayQuestion) {
          // Skip if we can't get question text
          return null;
        }
        
        const personalizedQuestion = personalizeQuestion(displayQuestion);
        
        return (
          <View key={`${prompt.prompt_question_id}-${prompt.display_order}`} style={styles.promptCard}>
            <AppText variant="body" style={styles.promptTitle}>
              {personalizedQuestion}
            </AppText>
            <AppText variant="body" style={styles.answerText}>
              {prompt.answer_text}
            </AppText>
          </View>
        );
      }).filter(Boolean)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.lg,
  },
  label: {
    marginBottom: Spacing.md,
    fontWeight: '600',
  },
  promptCard: {
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.text,
  },
  promptTitle: {
    marginBottom: Spacing.sm,
    fontWeight: '600',
  },
  answerText: {
    opacity: 0.7,
    lineHeight: 20,
  },
});
