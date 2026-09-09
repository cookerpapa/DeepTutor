import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import KbLinkedFoldersSection from "@/components/knowledge/KbLinkedFoldersSection";
import { initI18n } from "@/i18n/init";
import type { TaskState } from "@/hooks/useKnowledgeProgress";
import type { KnowledgeBase } from "@/lib/knowledge-helpers";

initI18n("en");

const api = vi.hoisted(() => ({
  list: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
}));
vi.mock("@/features/knowledge/api/sources", () => ({
  listLinkedFolders: api.list,
  linkLocalFolder: api.link,
  unlinkLocalFolder: api.unlink,
}));

const folder = {
  id: "source-1",
  path: "/srv/notes",
  added_at: "2026-09-01T12:00:00",
  file_count: 2,
  last_sync: null,
};
const kb: KnowledgeBase = {
  name: "Notes",
  status: "ready",
  statistics: { rag_provider: "llamaindex" },
};
const task: TaskState = {
  taskId: "sync-1",
  kind: "upload",
  label: "Folder sync",
  logs: [],
  executing: true,
  error: null,
};

beforeEach(() => {
  api.list.mockReset().mockResolvedValue([folder]);
  api.link.mockReset().mockResolvedValue(folder);
  api.unlink.mockReset().mockResolvedValue(undefined);
});

it("links the supplied server path and explains that importing is a separate action", async () => {
  render(<KbLinkedFoldersSection kb={kb} onSyncFolder={vi.fn()} />);
  await screen.findByText(folder.path);
  expect(
    screen.getByText(/mounted path inside the container/),
  ).toBeInTheDocument();
  fireEvent.change(
    screen.getByLabelText("Folder path on the DeepTutor server"),
    { target: { value: "  /srv/new notes  " } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Link folder" }));
  await screen.findByText(
    "Folder linked. Choose Sync now to import its documents.",
  );
  expect(api.link).toHaveBeenCalledWith("Notes", "/srv/new notes");
  expect(
    screen.getByLabelText("Folder path on the DeepTutor server"),
  ).toHaveValue("");
});

it("keeps an invalid path available for correction and displays the backend error", async () => {
  api.link.mockRejectedValue(new Error("Folder does not exist"));
  render(<KbLinkedFoldersSection kb={kb} onSyncFolder={vi.fn()} />);
  fireEvent.change(
    screen.getByLabelText("Folder path on the DeepTutor server"),
    { target: { value: "/missing" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Link folder" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Folder does not exist",
  );
  expect(
    screen.getByLabelText("Folder path on the DeepTutor server"),
  ).toHaveValue("/missing");
});

it("does not mark an unchanged folder as newly synced", async () => {
  const sync = vi
    .fn()
    .mockResolvedValue({ file_count: 0, message: "No changes" });
  render(<KbLinkedFoldersSection kb={kb} onSyncFolder={sync} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Sync /srv/notes" }),
  );
  await screen.findByText("No new or modified files to sync.");
  expect(sync).toHaveBeenCalledWith("Notes", "source-1");
  expect(
    screen.getByText(/Last successful sync: Never synced/),
  ).toBeInTheDocument();
  expect(screen.queryByText("Folder sync completed.")).not.toBeInTheDocument();
});

it("shows queued and running progress before publishing a successful sync", async () => {
  const sync = vi.fn().mockResolvedValue({
    task_id: "sync-1",
    file_count: 2,
    new_files: 1,
    modified_files: 1,
  });
  const view = render(<KbLinkedFoldersSection kb={kb} onSyncFolder={sync} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Sync /srv/notes" }),
  );
  await screen.findByText("Queued 2 files: 1 new, 1 modified.");
  expect(screen.queryByText("Folder sync completed.")).not.toBeInTheDocument();

  view.rerender(
    <KbLinkedFoldersSection
      kb={{
        ...kb,
        status: "processing",
        progress: {
          stage: "processing_documents",
          progress_percent: 50,
          message: "Processing notes",
        },
      }}
      task={task}
      onSyncFolder={sync}
    />,
  );
  expect(
    screen.getByRole("progressbar", { name: "Indexing progress" }),
  ).toHaveValue(50);
  expect(
    screen.getByRole("button", { name: "Sync /srv/notes" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Link folder" })).toBeDisabled();
  expect(
    screen.getByText(/Last successful sync: Never synced/),
  ).toBeInTheDocument();

  api.list.mockResolvedValue([{ ...folder, last_sync: "2026-09-09T12:30:00" }]);
  view.rerender(
    <KbLinkedFoldersSection
      kb={kb}
      task={{ ...task, executing: false }}
      onSyncFolder={sync}
    />,
  );
  await screen.findByText("Folder sync completed.");
  await waitFor(() =>
    expect(screen.queryByText(/Never synced/)).not.toBeInTheDocument(),
  );
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sync /srv/notes" })).toBeEnabled();
});

it("reports a failed background import without claiming sync success", async () => {
  const sync = vi.fn().mockResolvedValue({ task_id: "sync-1", file_count: 2 });
  const view = render(<KbLinkedFoldersSection kb={kb} onSyncFolder={sync} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Sync /srv/notes" }),
  );
  await screen.findByText(/Queued 2 files/);
  view.rerender(
    <KbLinkedFoldersSection
      kb={kb}
      task={{
        ...task,
        executing: false,
        error: "Embedding service unavailable",
      }}
      onSyncFolder={sync}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Embedding service unavailable",
  );
  expect(screen.queryByText(/Queued 2 files/)).not.toBeInTheDocument();
  expect(screen.queryByText("Folder sync completed.")).not.toBeInTheDocument();
  expect(
    screen.getByText(/Last successful sync: Never synced/),
  ).toBeInTheDocument();
});

it("requires confirmation before unlinking and preserves imported-document wording", async () => {
  render(<KbLinkedFoldersSection kb={kb} onSyncFolder={vi.fn()} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Unlink /srv/notes" }),
  );
  expect(api.unlink).not.toHaveBeenCalled();
  expect(
    screen.getByText(/Imported documents stay in this knowledge base/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(api.unlink).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Unlink /srv/notes" }));
  api.list.mockResolvedValue([]);
  fireEvent.click(screen.getByRole("button", { name: "Unlink folder" }));
  await screen.findByText("Folder unlinked. Imported documents are kept.");
  expect(api.unlink).toHaveBeenCalledWith("Notes", "source-1");
  await screen.findByText("No linked folders yet.");
});

it("shows and retries a list error instead of presenting an empty folder list", async () => {
  api.list.mockRejectedValue(new Error("Access denied"));
  render(<KbLinkedFoldersSection kb={kb} onSyncFolder={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Access denied");
  expect(screen.queryByText("No linked folders yet.")).not.toBeInTheDocument();
  api.list.mockResolvedValue([folder]);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText(folder.path);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("aborts stale list requests when the selected knowledge base changes", async () => {
  let resolveOld!: (value: (typeof folder)[]) => void;
  api.list.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve;
    }),
  );
  const view = render(
    <KbLinkedFoldersSection key="old" kb={kb} onSyncFolder={vi.fn()} />,
  );
  const signal = api.list.mock.calls[0][1] as AbortSignal;
  view.rerender(
    <KbLinkedFoldersSection
      key="new"
      kb={{ ...kb, name: "Other" }}
      onSyncFolder={vi.fn()}
    />,
  );
  await screen.findByText(folder.path);
  expect(signal.aborted).toBe(true);
  await act(async () => {
    resolveOld([{ ...folder, path: "/stale/folder" }]);
  });
  await waitFor(() =>
    expect(screen.queryByText("/stale/folder")).not.toBeInTheDocument(),
  );
});

it("does not fetch source paths or expose controls for read-only knowledge bases", () => {
  const view = render(
    <KbLinkedFoldersSection
      kb={{ ...kb, read_only: true }}
      onSyncFolder={vi.fn()}
    />,
  );
  expect(view.container).toBeEmptyDOMElement();
  expect(api.list).not.toHaveBeenCalled();
});
