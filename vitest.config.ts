import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: [
      // Test-specific aliases — order matters, more specific first
      {
        find: /^@\/stores\/store$/,
        replacement: path.resolve(__dirname, "src/__mocks__/mockedStore.ts"),
      },
      {
        find: /^webextension-polyfill$/,
        replacement: path.resolve(
          __dirname,
          "src/__mocks__/mockedWebExtensionPolyfill.ts",
        ),
      },
      {
        find: /^@\/i18n$/,
        replacement: path.resolve(
          __dirname,
          "src/__mocks__/i18nTestSetup.ts",
        ),
      },
      // Base aliases from vite.config
      { find: "@", replacement: path.resolve(__dirname, "src") },
      {
        find: "events",
        replacement: path.resolve(
          __dirname,
          "node_modules/rollup-plugin-node-polyfills/polyfills/events.js",
        ),
      },
      { find: "buffer", replacement: "buffer" },
    ],
  },
  test: {
    environment: "jsdom",
    clearMocks: true,
    globals: false,
    setupFiles: ["src/__mocks__/i18nTestSetup.ts", "vitest.setup.ts"],
    server: {
      deps: {
        inline: ["@theqrl/abi", "@theqrl/qrl-cryptography", "@noble/hashes"],
      },
    },
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      exclude: ["src/components/UI/**"],
    },
  },
});
