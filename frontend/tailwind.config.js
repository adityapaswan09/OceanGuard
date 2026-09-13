/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                sans: ["DM Sans", "ui-sans-serif", "sans-serif"],
                display: ["Space Grotesk", "DM Sans", "sans-serif"],
            },
            colors: {
                ink: "#e8f0f5",
                panel: "#0a1c2c",
                panelAlt: "#0d2235",
                line: "#1e3a52",
                signal: "#00d4ff",
                signalDim: "#0088aa",
                ember: "#d96d4c",
                spill: "#e74c3c",
                winner: "#f59e0b",
                mist: "#5a7d96",
                navy: "#020b14",
                deepNavy: "#04111d",
                success: "#22c55e",
                warning: "#eab308",
                danger: "#ef4444",
            },
            boxShadow: {
                panel: "0 4px 24px rgba(0, 0, 0, 0.4)",
                glow: "0 0 20px rgba(0, 212, 255, 0.15)",
                winnerGlow: "0 0 16px rgba(245, 158, 11, 0.4)",
                spillGlow: "0 0 24px rgba(231, 76, 60, 0.3)",
            },
            animation: {
                "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                "glow": "glow 2s ease-in-out infinite alternate",
            },
            keyframes: {
                glow: {
                    "0%": { boxShadow: "0 0 8px rgba(0, 212, 255, 0.1)" },
                    "100%": { boxShadow: "0 0 20px rgba(0, 212, 255, 0.25)" },
                },
            },
        },
    },
    plugins: [],
};
