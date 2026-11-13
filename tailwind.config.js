/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  darkMode: 'class',
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        raised: token('raised'),
        fill: { DEFAULT: token('fill'), strong: token('fill-strong') },
        line: { DEFAULT: token('line'), soft: token('line-soft') },
        ink: token('ink'),
        body: token('body'),
        muted: token('muted'),
        subtle: token('subtle'),
        faint: token('faint'),
        primary: { DEFAULT: token('primary'), soft: token('primary-soft') },
        'on-primary': token('on-primary'),
        secret: { DEFAULT: token('secret'), soft: token('secret-soft') },
        like: token('like'),
        success: { DEFAULT: token('success'), soft: token('success-soft') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
      },
    },
  },
  plugins: [],
};
