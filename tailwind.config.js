/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{ts,tsx}",
    "./index.html"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Regex Design System - Dark Technical Minimalism
        canvas: '#09090B',        // --bg-canvas
        surface: '#121215',       // --bg-surface
        'surface-hover': '#1C1C21', // --bg-surface-hover
        'border-subtle': '#27272A', // --border-subtle
        'accent-primary': '#10B981', // --accent-primary
        'accent-glow': 'rgba(16, 185, 129, 0.15)', // --accent-glow
        'text-primary': '#F4F4F5', // --text-primary
        'text-secondary': '#A1A1AA', // --text-secondary
        'text-muted': '#71717A',   // --text-muted
        'status-warning': '#F59E0B', // --status-warning
        'status-danger': '#EF4444', // --status-danger

        // Semantic aliases
        bg: {
          primary: '#09090B',
          secondary: '#121215',
          tertiary: '#1C1C21',
        },
        border: {
          subtle: '#27272A',
          default: '#3F3F46',
          strong: '#52525B',
        },
        text: {
          primary: '#F4F4F5',
          secondary: '#A1A1AA',
          muted: '#71717A',
        },
        accent: {
          primary: '#10B981',
          glow: 'rgba(16, 185, 129, 0.15)',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'heading-1': ['1.25rem', { lineHeight: '1.3', fontWeight: '600' }],
        'device-label': ['0.875rem', { lineHeight: '1.4', fontWeight: '500' }],
        'body-text': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
        'mono-badge': ['0.75rem', { lineHeight: '1.2', fontWeight: '500' }],
        'mono-sm': ['0.6875rem', { lineHeight: '1.3', fontWeight: '500' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '26': '6.5rem',
        '30': '7.5rem',
      },
      borderRadius: {
        'radius-sm': '0.375rem',   // 6px
        'radius-md': '0.5rem',     // 8px
        'radius-lg': '0.75rem',    // 12px
        'radius-xl': '1rem',       // 16px
        'radius-2xl': '1.5rem',    // 24px
        'radius-full': '9999px',
      },
      boxShadow: {
        'glow-sm': '0 0 8px rgba(16, 185, 129, 0.2)',
        'glow-md': '0 0 16px rgba(16, 185, 129, 0.3)',
        'glow-lg': '0 0 24px rgba(16, 185, 129, 0.4)',
        'elevation-1': '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)',
        'elevation-2': '0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3)',
        'elevation-3': '0 12px 32px rgba(0, 0, 0, 0.5), 0 4px 8px rgba(0, 0, 0, 0.4)',
        'sheet': '0 24px 48px rgba(0, 0, 0, 0.6), 0 8px 16px rgba(0, 0, 0, 0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-radar': 'pulse-radar 3s ease-out infinite',
        'fade-in': 'fade-in 200ms ease-out',
        'fade-out': 'fade-out 150ms ease-in',
        'slide-up': 'slide-up 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slide-down 200ms cubic-bezier(0.4, 0, 1, 1)',
        'scale-in': 'scale-in 150ms cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-out': 'scale-out 100ms cubic-bezier(0.4, 0, 1, 1)',
        'spin-slow': 'spin 2s linear infinite',
        'shimmer': 'shimmer 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-radar': {
          '0%': { transform: 'scale(0.8)', opacity: '0.6' },
          '100%': { transform: 'scale(1.4)', opacity: '0' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(100%)', opacity: '0' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'scale-out': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.95)', opacity: '0' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      transitionDuration: {
        'fast': '100ms',
        'normal': '200ms',
        'slow': '300ms',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'ease-out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'ease-in-expo': 'cubic-bezier(0.7, 0, 0.84, 0)',
      },
      zIndex: {
        'overlay': '40',
        'modal': '50',
        'toast': '60',
        'tooltip': '70',
      },
      screens: {
        'xs': '360px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1440px',
      },
    },
  },
  plugins: [],
}