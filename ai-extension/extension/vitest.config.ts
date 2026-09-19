import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
    plugins: [vue()],
    test: {
        environment: "jsdom",
        setupFiles: ["./vitest.setup.ts"],
        // e2e/ holds Playwright specs (run via `npm run test:e2e`), not Vitest tests.
        exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    },
});
