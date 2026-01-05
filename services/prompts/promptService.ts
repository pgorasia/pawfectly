/**
 * Prompt Service - Fetches and caches prompt questions
 */

import { supabase } from '../supabase/supabaseClient';

export interface PromptQuestion {
  id: string;
  question_text: string;
  suggestions: string | null;
  display_order: number | null;
  is_active: boolean;
}

// In-memory cache for prompts (can be extended to AsyncStorage if needed)
let promptsCache: PromptQuestion[] | null = null;
let promptsCacheTimestamp: number | null = null;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Fallback prompts (hardcoded resilience backup)
const FALLBACK_PROMPTS: PromptQuestion[] = [
  { id: 'fallback-1', question_text: 'My dog\'s love language is:', suggestions: 'treats / praise / fetch / cuddles / personal space', display_order: 1, is_active: true },
  { id: 'fallback-2', question_text: 'Most dramatic thing my dog does is:', suggestions: null, display_order: 2, is_active: true },
  { id: 'fallback-3', question_text: 'My dog would 100% judge you for:', suggestions: 'not sharing snacks, walking too slowly, etc.', display_order: 3, is_active: true },
  { id: 'fallback-4', question_text: 'The one thing my dog is weirdly obsessed with:', suggestions: 'sticks, shadows, squeaky donuts, etc.', display_order: 4, is_active: true },
  { id: 'fallback-5', question_text: 'The funniest compliment my dog has ever received:', suggestions: null, display_order: 5, is_active: true },
  { id: 'fallback-6', question_text: 'A time my dog chose chaos over peace:', suggestions: null, display_order: 6, is_active: true },
  { id: 'fallback-7', question_text: 'Our most wholesome moment was:', suggestions: null, display_order: 7, is_active: true },
  { id: 'fallback-8', question_text: 'My dog\'s greatest accomplishment is:', suggestions: 'graduated puppy class, mastered recall, conquered the vacuum', display_order: 8, is_active: true },
  { id: 'fallback-9', question_text: 'Teach my dog a new skill and I\'ll:', suggestions: 'share treats / buy coffee / swap training tips', display_order: 9, is_active: true },
  { id: 'fallback-10', question_text: 'If my dog could leave a review of me, it would say:', suggestions: null, display_order: 10, is_active: true },
  { id: 'fallback-11', question_text: 'My dog\'s biggest flex is:', suggestions: 'e.g., "can hear a cheese wrapper from three rooms away."', display_order: 11, is_active: true },
  { id: 'fallback-12', question_text: 'My dog is convinced they invented:', suggestions: 'fetch / naps / barking at delivery drivers', display_order: 12, is_active: true },
  { id: 'fallback-13', question_text: 'My dog\'s most unhinged opinion is:', suggestions: 'e.g., "all squirrels are personal enemies."', display_order: 13, is_active: true },
  { id: 'fallback-14', question_text: 'The thing my dog thinks they\'re famous for:', suggestions: null, display_order: 14, is_active: true },
  { id: 'fallback-15', question_text: 'My dog\'s villain origin story started when:', suggestions: 'bath time / nail trim / vacuum appeared', display_order: 15, is_active: true },
  { id: 'fallback-16', question_text: 'If my dog had a podcast, it would be called:', suggestions: null, display_order: 16, is_active: true },
  { id: 'fallback-17', question_text: 'My dog\'s toxic trait is thinking they can:', suggestions: 'fit on my lap / outrun bikes / negotiate rules', display_order: 17, is_active: true },
  { id: 'fallback-18', question_text: 'My dog\'s guilty pleasure is:', suggestions: 'rolling in questionable smells / stealing socks', display_order: 18, is_active: true },
  { id: 'fallback-19', question_text: 'If my dog ran for mayor, their campaign promise would be:', suggestions: null, display_order: 19, is_active: true },
  { id: 'fallback-20', question_text: 'The one rule my dog thinks is optional:', suggestions: 'no jumping / no barking / "leave it"', display_order: 20, is_active: true },
  { id: 'fallback-21', question_text: 'The pettiest thing my dog has ever done is:', suggestions: null, display_order: 21, is_active: true },
  { id: 'fallback-22', question_text: 'My dog believes their job title is:', suggestions: 'home security / crumb inspector / emotional support supervisor', display_order: 22, is_active: true },
];

/**
 * Fetch prompt questions from Supabase
 * Uses cache if available and fresh, otherwise fetches from database
 * Falls back to hardcoded list if database fetch fails
 */
export async function getPromptQuestions(): Promise<PromptQuestion[]> {
  // Check cache first
  const now = Date.now();
  if (promptsCache && promptsCacheTimestamp && (now - promptsCacheTimestamp) < CACHE_DURATION) {
    return promptsCache;
  }

  try {
    // Fetch from database
    const { data, error } = await supabase
      .from('prompt_questions')
      .select('id, question_text, suggestions, display_order, is_active')
      .eq('is_active', true)
      .order('display_order', { ascending: true, nullsLast: true });

    if (error) {
      console.error('[promptService] Failed to fetch prompts from database:', error);
      // Fall back to hardcoded prompts
      return FALLBACK_PROMPTS;
    }

    if (data && data.length > 0) {
      // Update cache
      promptsCache = data;
      promptsCacheTimestamp = now;
      return data;
    }

    // If no data, use fallback
    return FALLBACK_PROMPTS;
  } catch (error) {
    console.error('[promptService] Error fetching prompts:', error);
    // Fall back to hardcoded prompts
    return FALLBACK_PROMPTS;
  }
}

/**
 * Clear the prompts cache (useful for testing or forced refresh)
 */
export function clearPromptsCache(): void {
  promptsCache = null;
  promptsCacheTimestamp = null;
}

/**
 * Parse question text to extract question and suggestions
 * Format: "Question text: (suggestions)"
 */
export function parsePromptQuestion(question: PromptQuestion): {
  question: string;
  suggestions: string | null;
} {
  // If suggestions are stored separately, use them
  if (question.suggestions) {
    return {
      question: question.question_text,
      suggestions: question.suggestions,
    };
  }

  // Otherwise, try to parse from question_text
  const match = question.question_text.match(/^(.+?):\s*\((.+?)\)$/);
  if (match) {
    return {
      question: match[1].trim(),
      suggestions: match[2].trim(),
    };
  }

  return {
    question: question.question_text,
    suggestions: null,
  };
}
