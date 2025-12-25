export const Typography = {
  heading: {
    fontSize: 24,
  },
  body: {
    fontSize: 16,
  },
  caption: {
    fontSize: 12,
  },
} as const;

export type TypographyVariant = keyof typeof Typography;

