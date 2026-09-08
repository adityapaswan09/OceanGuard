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
                ink: "#f4f8fb",
                panel: "#ffffff",
                line: "#d8e5ec",
                signal: "#087ea4",
                ember: "#d96d4c",
                mist: "#526875",
                navy: "#eef5f8",
            },
        },
    },
    plugins: [],
};
