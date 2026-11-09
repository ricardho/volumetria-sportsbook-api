import { defineConfig } from '@playwright/test';

/** Testes da própria suíte — offline, sem browser e sem chamar nenhuma API real. */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  reporter: 'list',
  fullyParallel: false,
});
