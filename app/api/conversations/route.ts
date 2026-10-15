import { z } from "zod";
import { api, identity, database, json, ApiError } from "@/lib/server";

export async function GET(request: Request) {
  return api(async () => {
    const user = await identity(request);
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      z.string().uuid().parse(id);
      const row = await database().prepare("SELECT id, title, messages, duration, revision, created_at FROM conversations WHERE id = ? AND owner_id = ?").bind(id, user.userId).first<{ id: string; title: string; messages: string; duration: number; revision: number; created_at: string }>();
      if (!row) throw new ApiError(404, "This conversation could not be found.");
      return json({ ...row, messages: JSON.parse(row.messages), createdAt: row.created_at });
    }
    const rows = await database().prepare("SELECT id, title, message_count, duration, created_at, updated_at FROM conversations WHERE owner_id = ? AND message_count > 0 ORDER BY updated_at DESC LIMIT 100").bind(user.userId).all();
    return json({ conversations: rows.results });
  });
}
export async function PUT(request: Request) {
  return api(async () => {
    await identity(request);
    throw new ApiError(410, "New conversations are saved only to your connected Google Drive folder. Open Settings to connect Drive.");
  });
}
export async function DELETE(request: Request) {
  return api(async () => {
    const user = await identity(request);
    const id = z.string().uuid().parse(new URL(request.url).searchParams.get("id"));
    await database().prepare("DELETE FROM conversations WHERE id = ? AND owner_id = ?").bind(id, user.userId).run();
    return json({ deleted: true });
  });
}
