import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  messages: text("messages").notNull().default("[]"),
  messageCount: integer("message_count").notNull().default(0),
  duration: integer("duration").notNull().default(0),
  revision: integer("revision").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_conversations_owner_updated").on(table.ownerId, table.updatedAt)]);
