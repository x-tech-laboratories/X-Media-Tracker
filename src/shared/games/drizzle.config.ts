// Where drizzle-kit reads the games schema and writes its migrations; `npm run db:generate` runs it for every feature.
export default { dialect: "sqlite", schema: "./src/shared/games/schema.ts", out: "./src/shared/games/migrations" };
