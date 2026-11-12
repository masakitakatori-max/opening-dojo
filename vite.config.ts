import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VITE_BASE is set by the deploy workflow ("/<repo>/" on GitHub Pages); locally the app lives at "/".
export default defineConfig({ base: process.env.VITE_BASE ?? "/", plugins: [react()] });
