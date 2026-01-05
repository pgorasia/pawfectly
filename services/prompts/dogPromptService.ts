/**
 * Dog Prompt Service - Manages dog prompt answers
 */

import { supabase } from '../supabase/supabaseClient';

export interface DogPromptAnswer {
  id: string;
  user_id: string;
  dog_slot: number;
  prompt_question_id: string;
  answer_text: string;
  display_order: number; // 1 or 2
}

export interface DogPromptAnswerWithQuestion extends DogPromptAnswer {
  question_text: string;
  suggestions: string | null;
}

/**
 * Get all prompt answers for a specific dog (by user_id and dog_slot)
 */
export async function getDogPromptAnswers(
  userId: string,
  dogSlot: number
): Promise<DogPromptAnswerWithQuestion[]> {
  const { data, error } = await supabase
    .from('dog_prompt_answers')
    .select(`
      id,
      user_id,
      dog_slot,
      prompt_question_id,
      answer_text,
      display_order,
      prompt_questions (
        question_text,
        suggestions
      )
    `)
    .eq('user_id', userId)
    .eq('dog_slot', dogSlot)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('[dogPromptService] Failed to fetch dog prompt answers:', error);
    throw new Error(`Failed to fetch dog prompt answers: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  // Transform the data to flatten the prompt_questions relation
  return data.map((item: any) => ({
    id: item.id,
    user_id: item.user_id,
    dog_slot: item.dog_slot,
    prompt_question_id: item.prompt_question_id,
    answer_text: item.answer_text,
    display_order: item.display_order,
    question_text: item.prompt_questions?.question_text || '',
    suggestions: item.prompt_questions?.suggestions || null,
  }));
}

/**
 * Get all prompt answers for all dogs of a user
 */
export async function getAllDogPromptAnswers(
  userId: string
): Promise<Record<number, DogPromptAnswerWithQuestion[]>> {
  const { data, error } = await supabase
    .from('dog_prompt_answers')
    .select(`
      id,
      user_id,
      dog_slot,
      prompt_question_id,
      answer_text,
      display_order,
      prompt_questions (
        question_text,
        suggestions
      )
    `)
    .eq('user_id', userId)
    .order('dog_slot', { ascending: true })
    .order('display_order', { ascending: true });

  if (error) {
    console.error('[dogPromptService] Failed to fetch all dog prompt answers:', error);
    throw new Error(`Failed to fetch all dog prompt answers: ${error.message}`);
  }

  if (!data) {
    return {};
  }

  // Group by dog_slot
  const result: Record<number, DogPromptAnswerWithQuestion[]> = {};

  data.forEach((item: any) => {
    const slot = item.dog_slot;
    if (!result[slot]) {
      result[slot] = [];
    }
    result[slot].push({
      id: item.id,
      user_id: item.user_id,
      dog_slot: item.dog_slot,
      prompt_question_id: item.prompt_question_id,
      answer_text: item.answer_text,
      display_order: item.display_order,
      question_text: item.prompt_questions?.question_text || '',
      suggestions: item.prompt_questions?.suggestions || null,
    });
  });

  return result;
}

/**
 * Save or update prompt answers for a dog
 * This will upsert (insert or update) the answers and delete any that are no longer present
 */
export async function saveDogPromptAnswers(
  userId: string,
  dogSlot: number,
  answers: Array<{
    prompt_question_id: string;
    answer_text: string;
    display_order: number; // 1 or 2
  }>
): Promise<void> {
  try {
    // Get existing answers for this dog
    const { data: existingAnswers } = await supabase
      .from('dog_prompt_answers')
      .select('id, prompt_question_id, display_order')
      .eq('user_id', userId)
      .eq('dog_slot', dogSlot);

    const existingIds = new Set(existingAnswers?.map(a => a.id) || []);

    // Prepare upsert data
    const answersToUpsert = answers.map((answer) => ({
      user_id: userId,
      dog_slot: dogSlot,
      prompt_question_id: answer.prompt_question_id,
      answer_text: answer.answer_text,
      display_order: answer.display_order,
    }));

    // Upsert answers (insert or update)
    if (answersToUpsert.length > 0) {
      const { error: upsertError } = await supabase
        .from('dog_prompt_answers')
        .upsert(answersToUpsert, {
          onConflict: 'user_id,dog_slot,display_order',
          ignoreDuplicates: false,
        });

      if (upsertError) {
        console.error('[dogPromptService] Failed to upsert dog prompt answers:', upsertError);
        throw new Error(`Failed to save dog prompt answers: ${upsertError.message}`);
      }
    }

    // Delete answers that are no longer present
    const currentDisplayOrders = new Set(answers.map(a => a.display_order));
    const answersToDelete = existingAnswers?.filter(
      (a) => !currentDisplayOrders.has(a.display_order)
    ) || [];

    if (answersToDelete.length > 0) {
      const idsToDelete = answersToDelete.map(a => a.id);
      const { error: deleteError } = await supabase
        .from('dog_prompt_answers')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) {
        console.error('[dogPromptService] Failed to delete removed prompt answers:', deleteError);
        // Don't throw - cleanup failure is not critical
      }
    }
  } catch (error) {
    console.error('[dogPromptService] Error saving dog prompt answers:', error);
    throw error;
  }
}

/**
 * Delete all prompt answers for a specific dog
 */
export async function deleteDogPromptAnswers(
  userId: string,
  dogSlot: number
): Promise<void> {
  const { error } = await supabase
    .from('dog_prompt_answers')
    .delete()
    .eq('user_id', userId)
    .eq('dog_slot', dogSlot);

  if (error) {
    console.error('[dogPromptService] Failed to delete dog prompt answers:', error);
    throw new Error(`Failed to delete dog prompt answers: ${error.message}`);
  }
}
