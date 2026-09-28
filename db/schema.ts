import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const workspace = sqliteTable("workspace", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull(),
  objectKey: text("object_key").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    summary: text("summary").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_runs_created_at").on(t.createdAt)],
);
export const limits = sqliteTable("rate_limits", {
  id: text("id").primaryKey(),
  attempts: integer("attempts").notNull(),
});
