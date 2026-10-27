import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "../webroot",
    emptyOutDir: true,
    target: "es2022",
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: "app.js",
        assetFileNames: (info) => {
          const name = info.name ?? (info.names && info.names[0]) ?? "";
          return name.endsWith(".css") ? "styles.css" : "assets/[name][extname]";
        }
      }
    }
  }
});
