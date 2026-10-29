import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Mirror tsconfig's "@/*" → "src/*" so tests can import app modules.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
