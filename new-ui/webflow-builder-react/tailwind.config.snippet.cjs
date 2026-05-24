// Merge this `theme.extend` block into your existing tailwind.config.{js,cjs,ts}
// Replace the entire `extend` if you don't have one, or merge the relevant keys.

module.exports = {
  theme: {
    extend: {
      colors: {
        wb: {
          titlebar: '#0c0c0c',
          panel: '#1c1c1c',
          surface: {
            1: '#232323',
            2: '#2a2a2a',
            3: '#333333',
          },
          input: '#1a1a1a',
          accent: {
            DEFAULT: '#146ef5',
            hover: '#2d7dff',
          },
          success: '#00d09c',
          warning: '#f5b800',
          danger: '#ff5d5d',
          skipped: '#8a8a8a',
          ai: '#b46cff',
          text: {
            primary: '#ededed',
            secondary: '#a3a3a3',
            tertiary: '#6e6e6e',
            disabled: '#4a4a4a',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      // Add the .5 spacing values used throughout the components.
      spacing: {
        4.5: '18px',
        5.5: '22px',
        6.5: '26px',
      },
    },
  },
};
