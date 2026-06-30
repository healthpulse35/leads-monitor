import { defineConfig } from "vite";

// Static SPA. `base: "./"` keeps asset paths relative so the build works on
// Netlify, Vercel, and GitHub Pages (project pages served from a subpath) alike.
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    outDir: "dist",
  },
});
