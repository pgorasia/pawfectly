/**
 * Dog Prompts Component
 * Allows users to add up to 2 prompts per dog
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { getPromptQuestions, parsePromptQuestion, type PromptQuestion } from '@/services/prompts/promptService';
import type { DogProfile, DogPrompt } from '@/hooks/useProfileDraft';

interface DogPromptsProps {
  dog: DogProfile;
  onUpdate: (updates: Partial<DogProfile>) => void;
}

export function DogPrompts({ dog, onUpdate }: DogPromptsProps) {
  const [prompts, setPrompts] = useState<PromptQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState<number | null>(null); // 1 or 2 for which prompt slot
  const [searchText, setSearchText] = useState('');

  // Load available prompts
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        const availablePrompts = await getPromptQuestions();
        // Filter out fallback prompts (IDs starting with 'fallback-') since they're not valid UUIDs
        // and cannot be saved to the database
        const validPrompts = availablePrompts.filter(p => !p.id.startsWith('fallback-'));
        setPrompts(validPrompts);
        
        if (validPrompts.length < availablePrompts.length) {
          console.warn(`[DogPrompts] Filtered out ${availablePrompts.length - validPrompts.length} fallback prompts`);
        }
      } catch (error) {
        console.error('[DogPrompts] Failed to load prompts:', error);
      } finally {
        setLoading(false);
      }
    };
    loadPrompts();
  }, []);

  // Get current prompts for this dog
  const currentPrompts = dog.prompts || [];
  const prompt1 = currentPrompts.find(p => p.display_order === 1);
  const prompt2 = currentPrompts.find(p => p.display_order === 2);

  // Get available display orders (1 or 2) that are not used
  const usedDisplayOrders = new Set(currentPrompts.map(p => p.display_order));
  const availableDisplayOrders = [1, 2].filter(order => !usedDisplayOrders.has(order));

  // Filter prompts to exclude already selected ones for this dog
  const usedPromptIds = new Set(currentPrompts.map(p => p.prompt_question_id));
  const availablePrompts = prompts.filter(p => !usedPromptIds.has(p.id));

  // Filter by search text
  const filteredPrompts = availablePrompts.filter(p =>
    p.question_text.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleAddPrompt = (displayOrder: number) => {
    setShowDropdown(displayOrder);
    setSearchText('');
  };

  const handleSelectPrompt = (prompt: PromptQuestion, displayOrder: number) => {
    const newPrompt: DogPrompt = {
      prompt_question_id: prompt.id,
      answer_text: '',
      display_order: displayOrder,
    };

    const updatedPrompts = currentPrompts.filter(p => p.display_order !== displayOrder);
    updatedPrompts.push(newPrompt);

    onUpdate({ prompts: updatedPrompts });
    setShowDropdown(null);
  };

  const handleUpdateAnswer = (displayOrder: number, answerText: string) => {
    const updatedPrompts = currentPrompts.map(p =>
      p.display_order === displayOrder
        ? { ...p, answer_text: answerText }
        : p
    );
    onUpdate({ prompts: updatedPrompts });
  };

  const handleDeletePrompt = (displayOrder: number) => {
    const updatedPrompts = currentPrompts.filter(p => p.display_order !== displayOrder);
    onUpdate({ prompts: updatedPrompts.length > 0 ? updatedPrompts : undefined });
  };

  const handleChangePrompt = (displayOrder: number) => {
    setShowDropdown(displayOrder);
    setSearchText('');
  };

  // Get prompt question details for display
  const getPromptQuestion = (promptQuestionId: string): PromptQuestion | undefined => {
    return prompts.find(p => p.id === promptQuestionId);
  };

  // Get dog's name for display (use proper English with possessive)
  const getDogName = () => {
    if (dog.name && dog.name.trim()) {
      const name = dog.name.trim();
      // Handle possessive: if name ends in 's', just add apostrophe, otherwise add 's
      const possessive = name.endsWith('s') ? `${name}'` : `${name}'s`;
      return possessive;
    }
    return 'your dog\'s';
  };

  // Replace "my dog" with dog's name in question text
  const personalizeQuestion = (questionText: string): string => {
    if (dog.name && dog.name.trim()) {
      const dogName = dog.name.trim();
      // Replace "my dog" with the dog's name (case insensitive)
      return questionText.replace(/my dog/gi, dogName);
    }
    return questionText;
  };

  const dogName = getDogName();

  return (
    <View style={styles.container}>
      <AppText variant="body" style={styles.label}>
        Add Personality Prompts
      </AppText>
      <AppText variant="caption" style={styles.hint}>
        Share fun facts about {dogName} (optional)
      </AppText>

      {/* Display existing prompts */}
      {prompt1 && (() => {
        const question = getPromptQuestion(prompt1.prompt_question_id);
        const parsed = question ? parsePromptQuestion(question) : null;
        const personalizedQuestion = parsed ? personalizeQuestion(parsed.question) : 'Question';
        
        return (
          <View style={styles.promptCard}>
            <View style={styles.promptHeader}>
              <AppText variant="body" style={styles.promptTitle}>
                {personalizedQuestion}
              </AppText>
              <View style={styles.promptActions}>
                <TouchableOpacity
                  onPress={() => handleChangePrompt(1)}
                  style={styles.actionButton}
                >
                  <MaterialIcons name="edit" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeletePrompt(1)}
                  style={styles.actionButton}
                >
                  <MaterialIcons name="delete" size={18} color={Colors.accent} />
                </TouchableOpacity>
              </View>
            </View>
            {parsed?.suggestions && (
              <AppText variant="caption" style={styles.suggestionsText}>
                {parsed.suggestions}
              </AppText>
            )}
            <TextInput
              style={styles.answerInput}
              value={prompt1.answer_text}
              onChangeText={(text) => handleUpdateAnswer(1, text)}
              multiline
            />
          </View>
        );
      })()}

      {prompt2 && (() => {
        const question = getPromptQuestion(prompt2.prompt_question_id);
        const parsed = question ? parsePromptQuestion(question) : null;
        const personalizedQuestion = parsed ? personalizeQuestion(parsed.question) : 'Question';
        
        return (
          <View style={styles.promptCard}>
            <View style={styles.promptHeader}>
              <AppText variant="body" style={styles.promptTitle}>
                {personalizedQuestion}
              </AppText>
              <View style={styles.promptActions}>
                <TouchableOpacity
                  onPress={() => handleChangePrompt(2)}
                  style={styles.actionButton}
                >
                  <MaterialIcons name="edit" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeletePrompt(2)}
                  style={styles.actionButton}
                >
                  <MaterialIcons name="delete" size={18} color={Colors.accent} />
                </TouchableOpacity>
              </View>
            </View>
            {parsed?.suggestions && (
              <AppText variant="caption" style={styles.suggestionsText}>
                {parsed.suggestions}
              </AppText>
            )}
            <TextInput
              style={styles.answerInput}
              value={prompt2.answer_text}
              onChangeText={(text) => handleUpdateAnswer(2, text)}
              multiline
            />
          </View>
        );
      })()}

      {/* Show add buttons for unused slots */}
      {availableDisplayOrders.length > 0 && (
        <View style={styles.addButtonsContainer}>
          {availableDisplayOrders.includes(1) && (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => handleAddPrompt(1)}
            >
              <AppText variant="body" color={Colors.primary}>
                + Add a Tail-Wagger
              </AppText>
            </TouchableOpacity>
          )}
          {availableDisplayOrders.includes(2) && (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => handleAddPrompt(2)}
            >
              <AppText variant="body" color={Colors.primary}>
                + Add a Little Chaos
              </AppText>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Prompt Selection Modal */}
      <Modal
        visible={showDropdown !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDropdown(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <AppText variant="heading">
                {showDropdown === 1 ? 'Select Tail-Wagger Prompt' : 'Select Little Chaos Prompt'}
              </AppText>
              <TouchableOpacity onPress={() => setShowDropdown(null)}>
                <AppText variant="body" color={Colors.primary}>Close</AppText>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder="Search prompts..."
              value={searchText}
              onChangeText={setSearchText}
              placeholderTextColor={Colors.text + '80'}
            />
            <ScrollView style={styles.promptList}>
              {loading ? (
                <AppText variant="body" style={styles.emptyText}>Loading prompts...</AppText>
              ) : filteredPrompts.length === 0 ? (
                <AppText variant="body" style={styles.emptyText}>No prompts found</AppText>
              ) : (
                filteredPrompts.map((prompt) => {
                  const parsed = parsePromptQuestion(prompt);
                  return (
                    <TouchableOpacity
                      key={prompt.id}
                      style={styles.promptItem}
                      onPress={() => {
                        if (showDropdown !== null) {
                          handleSelectPrompt(prompt, showDropdown);
                        }
                      }}
                    >
                      <AppText variant="body">{parsed.question}</AppText>
                      {parsed.suggestions && (
                        <AppText variant="caption" style={styles.suggestionsText}>
                          {parsed.suggestions}
                        </AppText>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.lg,
  },
  label: {
    marginBottom: Spacing.sm,
    fontWeight: '600',
  },
  hint: {
    marginBottom: Spacing.md,
    opacity: 0.6,
  },
  promptCard: {
    borderWidth: 1,
    borderColor: Colors.text,
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  promptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  promptTitle: {
    flex: 1,
    marginRight: Spacing.sm,
    fontWeight: '600',
  },
  promptActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    padding: Spacing.xs,
  },
  suggestionsText: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
    opacity: 0.6,
    fontStyle: 'italic',
  },
  answerInput: {
    borderWidth: 1,
    borderColor: Colors.text,
    borderRadius: 8,
    padding: Spacing.md,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  addButtonsContainer: {
    gap: Spacing.sm,
  },
  addButton: {
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 8,
    borderStyle: 'dashed',
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
  promptList: {
    maxHeight: 400,
  },
  promptItem: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.text,
    opacity: 0.7,
  },
  emptyText: {
    textAlign: 'center',
    padding: Spacing.xl,
    opacity: 0.6,
  },
});
