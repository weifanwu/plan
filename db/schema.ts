import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const mapUserState = sqliteTable("map_user_state", {
  userId: text("user_id").primaryKey(),
  payloadJson: text("payload_json").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});
