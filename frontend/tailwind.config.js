/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: '#030014', // Deep space void
                surface: '#0F172A',
                primary: '#8B5CF6',    // Electric Purple
                secondary: '#EC4899',  // Cyber Pink
                accent: '#38BDF8',     // Holographic Blue
                glass: 'rgba(255, 255, 255, 0.05)',
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
            animation: {
                'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'float': 'float 6s ease-in-out infinite',
                'glow': 'glow 2s ease-in-out infinite alternate',
                'spin-slow': 'spin 12s linear infinite',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-20px)' },
                },
                glow: {
                    '0%': { boxShadow: '0 0 20px rgba(139, 92, 246, 0.3)' },
                    '100%': { boxShadow: '0 0 40px rgba(139, 92, 246, 0.6), 0 0 80px rgba(236, 72, 153, 0.4)' },
                }
            },
            backgroundImage: {
                'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
                'cyber-grid': 'linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px)',
            }
        },
    },
    plugins: [],
}
