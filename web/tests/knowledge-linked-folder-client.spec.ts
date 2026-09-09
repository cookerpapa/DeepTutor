import { beforeEach, expect, it, vi } from "vitest";
import {
  linkLocalFolder,
  listLinkedFolders,
  syncLinkedFolder,
  unlinkLocalFolder,
} from "@/features/knowledge/api/sources";

const fixture = vi.hoisted(() => ({ fetch: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/api", () => ({
  apiFetch: fixture.fetch,
  apiUrl: (path: string) => `https://deeptutor.example${path}`,
}));
vi.mock("@/lib/client-cache", () => ({
  invalidateClientCache: fixture.invalidate,
  withClientCache: vi.fn(),
}));

beforeEach(() => {
  fixture.fetch.mockReset();
  fixture.invalidate.mockClear();
});

it("encodes the KB name and folder ID without changing the server filesystem path", async () => {
  const kbName = "研究 notes#1";
  const folderId = "source#1";
  const folder = {
    id: folderId,
    path: "/srv/研究 notes",
    added_at: "2026-09-01",
    file_count: 2,
  };
  const base = `https://deeptutor.example/api/knowledge-bases/${encodeURIComponent(kbName)}`;
  fixture.fetch.mockResolvedValueOnce(Response.json(folder));
  expect(await linkLocalFolder(kbName, folder.path)).toEqual(folder);
  expect(fixture.fetch).toHaveBeenLastCalledWith(`${base}/link-folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder_path: folder.path }),
  });

  const signal = new AbortController().signal;
  fixture.fetch.mockResolvedValueOnce(Response.json([folder]));
  expect(await listLinkedFolders(kbName, signal)).toEqual([folder]);
  expect(fixture.fetch).toHaveBeenLastCalledWith(`${base}/linked-folders`, {
    signal,
  });

  fixture.fetch.mockResolvedValueOnce(
    Response.json({ task_id: "task-1", file_count: 2 }),
  );
  expect(await syncLinkedFolder(kbName, folderId)).toMatchObject({
    task_id: "task-1",
  });
  expect(fixture.fetch).toHaveBeenLastCalledWith(
    `${base}/sync-folder/source%231`,
    { method: "POST" },
  );

  fixture.fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await unlinkLocalFolder(kbName, folderId);
  expect(fixture.fetch).toHaveBeenLastCalledWith(
    `${base}/linked-folders/source%231`,
    { method: "DELETE" },
  );
  expect(fixture.invalidate).toHaveBeenCalledTimes(3);
});

it("preserves actionable backend errors and does not invalidate data after rejection", async () => {
  fixture.fetch.mockResolvedValue(
    Response.json(
      { detail: "Folder does not exist: /missing" },
      { status: 400 },
    ),
  );
  await expect(linkLocalFolder("notes", "/missing")).rejects.toThrow(
    "Folder does not exist: /missing",
  );
  expect(fixture.invalidate).not.toHaveBeenCalled();
});
