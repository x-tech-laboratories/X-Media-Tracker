// Where drizzle-kit reads the books schema and writes its migrations; `npm run db:generate` runs it for every feature.
export default { dialect: "sqlite", schema: "./src/shared/books/schema.ts", out: "./src/shared/books/migrations" };
