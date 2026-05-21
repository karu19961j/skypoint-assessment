/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe6ff",
          500: "#3b65f6",
          600: "#2849d5",
          700: "#2138ac",
        },
      },
    },
  },
  plugins: [],
};
