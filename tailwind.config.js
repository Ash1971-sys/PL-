module.exports = {
  content: ['./templates/*.html', './static/js/*.js'],
  theme: {
    extend: {
      colors: {
        'pl-purple': '#37003c',
        'pl-purple-dark': '#240028',
        'pl-purple-deep': '#1a001d',
        'pl-green': '#00ff85',
        'pl-pink': '#ff2882',
        'pl-cyan': '#05f0ff',
        'pl-gray-neutral': '#d1d1d6',
        'surface-dim': '#dbd9e1',
        'surface-container-low': '#f4f2fb',
        'surface-container': '#efedf5',
        'surface-container-high': '#e9e7ef',
        'surface-container-highest': '#e3e1ea',
        'surface-container-lowest': '#ffffff',
        'primary': '#37003c',
        'on-primary': '#ffffff',
        'secondary-container': '#00ff85',
        'tertiary-container': '#ff2882',
        'outline-variant': '#d2c2cd',
        'on-surface': '#1a1b21',
        'on-surface-variant': '#4f434d',
        'pl-dark': '#220026',
        'pl-magenta': '#ff2882',
        'pl-grey': '#f4f4f6',
        'pl-white': '#ffffff',
        'pl-border': '#4a0b52',
        'pl-fielddark': '#1c5e26',
      },
      fontFamily: {
        sans: ['system-ui', 'sans-serif'],
        display: ['system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'Consolas', 'monospace']
      }
    }
  }
};
