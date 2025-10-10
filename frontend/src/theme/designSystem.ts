import { MantineColorsTuple, createTheme } from '@mantine/core';

// Finance-grade design tokens
export const SPACING = {
  xs: 4,
  sm: 8, 
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32
} as const;

export const ELEVATION = {
  0: { boxShadow: 'none', border: '1px solid var(--mantine-color-gray-3)' },
  1: { boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid var(--mantine-color-gray-2)' },
  2: { boxShadow: '0 4px 6px rgba(0,0,0,0.07)', border: '1px solid var(--mantine-color-gray-1)' }
} as const;

export const MOTION = {
  duration: 175, // 150-200ms range
  easing: 'ease-in-out',
  // Use camelCase in the media key to avoid React treating it as a plain style property
  reducedMotion: '@media (prefersReducedMotion: reduce)'
} as const;

// WCAG AA compliant color palette
const brand: MantineColorsTuple = [
  '#f0f6ff','#d9e8ff','#a8ccff','#74a8ff','#4785ff','#2563eb','#1d4ed8','#1e40af','#1c3b94','#1a365d'
];

const gray: MantineColorsTuple = [
  '#fafafa','#f4f4f5','#e4e4e7','#d4d4d8','#a1a1aa','#71717a','#52525b','#3f3f46','#27272a','#18181b'
];

export const designTheme = createTheme({
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, monospace',
  headings: { fontFamily: 'Inter, sans-serif', fontWeight: '600' },
  primaryColor: 'brand',
  defaultRadius: 'md',
  colors: { brand, gray },
  primaryShade: { light: 5, dark: 6 }, // brand-500/600 for accents
  respectReducedMotion: true,
  components: {
    Card: {
      defaultProps: {
        shadow: 'sm',
        padding: 'md',
        radius: 'md',
        withBorder: true
      },
      styles: () => ({
        root: {
          backgroundColor: 'light-dark(#ffffff, rgba(39, 39, 42, 0.95))',
          transition: `all ${MOTION.duration}ms ${MOTION.easing}`,
          boxShadow: ELEVATION[1].boxShadow,
          border: ELEVATION[1].border
        }
      })
    },
    Button: {
      styles: () => ({
        root: {
          transition: `all ${MOTION.duration}ms ${MOTION.easing}`
        }
      })
    }
  }
});
