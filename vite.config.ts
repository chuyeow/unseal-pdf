import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  worker: {
    format: "es"
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "robots.txt"],
      manifest: {
        name: "Unseal",
        short_name: "Unseal",
        description: "Unlock password-protected PDFs locally in your browser.",
        theme_color: "#f4efe5",
        background_color: "#f4efe5",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,wasm}"]
      }
    })
  ]
});
