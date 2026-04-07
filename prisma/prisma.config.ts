import { defineConfig } from '@prisma/internals';

export default defineConfig({
  datasource: {
    url: process.env.POSTGRES_PRISMA_URL,
    directUrl: process.env.MIGRATIONS_OVER_POOLER_URL,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
