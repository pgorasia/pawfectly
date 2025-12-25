export const Colors = {
  primary: '#D97706',
  secondary: '#14B8A6',
  background: '#FFFFFF',
  text: '#1F2937',
  accent: '#F59E0B',
  error: '#EF4444', // Red for rejected photos
} as const;

export type ColorKey = keyof typeof Colors;

