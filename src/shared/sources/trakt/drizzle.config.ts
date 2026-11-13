// Where drizzle-kit reads the Trakt schema and writes its migrations; `npm run db:generate` runs it for every feature.
export default { dialect: "sqlite", schema: "./src/shared/sources/trakt/schema.ts", out: "./src/shared/sources/trakt/migrations" };
