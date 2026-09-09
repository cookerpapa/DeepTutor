"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderSync, Loader2, RefreshCw, Unlink } from "lucide-react";
import {
  linkLocalFolder,
  listLinkedFolders,
  unlinkLocalFolder,
  type LinkedFolder,
  type LinkedFolderSyncResult,
} from "@/features/knowledge/api/sources";
import type { TaskState } from "@/hooks/useKnowledgeProgress";
import {
  formatKnowledgeTimestamp,
  kbHasLiveProgress,
  kbNeedsReindex,
  kbSupportsLinkedFolders,
  progressMessage,
  resolveProgressPercent,
  type KnowledgeBase,
} from "@/lib/knowledge-helpers";

interface KbLinkedFoldersSectionProps {
  kb: KnowledgeBase;
  task?: TaskState;
  onSyncFolder: (
    kbName: string,
    folderId: string,
  ) => Promise<LinkedFolderSyncResult>;
}

/** Link source directories and follow their imports through the shared KB task stream. */
export default function KbLinkedFoldersSection({
  kb,
  task,
  onSyncFolder,
}: KbLinkedFoldersSectionProps) {
  const { t } = useTranslation();
  const supported = kbSupportsLinkedFolders(kb);
  const [folders, setFolders] = useState<LinkedFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState("");
  const [operation, setOperation] = useState<string | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncTaskId, setSyncTaskId] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const indexing = task?.executing === true || kbHasLiveProgress(kb);
  const busy = operation !== null || indexing;
  const needsReindex = kbNeedsReindex(kb);
  const syncTask = task?.taskId === syncTaskId ? task : undefined;

  useEffect(() => {
    if (!supported) return;
    const controller = new AbortController();
    listLinkedFolders(kb.name, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setFolders(result);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kb.name, supported, task?.taskId, task?.executing, refreshVersion]);

  const refresh = () => setRefreshVersion((version) => version + 1);

  const handleLink = async () => {
    const path = folderPath.trim();
    if (!path || busy) return;
    setOperation("link");
    setActionError(null);
    setNotice(null);
    setSyncTaskId(null);
    try {
      await linkLocalFolder(kb.name, path);
      setFolderPath("");
      setNotice(t("Folder linked. Choose Sync now to import its documents."));
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setOperation(null);
    }
  };

  const handleUnlink = async (folderId: string) => {
    if (busy) return;
    setOperation(`unlink:${folderId}`);
    setActionError(null);
    setNotice(null);
    setSyncTaskId(null);
    try {
      await unlinkLocalFolder(kb.name, folderId);
      setConfirmUnlink(null);
      setNotice(t("Folder unlinked. Imported documents are kept."));
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setOperation(null);
    }
  };

  const handleSync = async (folderId: string) => {
    if (busy || needsReindex) return;
    setOperation(`sync:${folderId}`);
    setActionError(null);
    setNotice(null);
    setSyncTaskId(null);
    try {
      const result = await onSyncFolder(kb.name, folderId);
      setSyncTaskId(result.task_id ?? null);
      setNotice(
        result.task_id
          ? t("Queued {{count}} files: {{new}} new, {{modified}} modified.", {
              count: result.file_count,
              new: result.new_files ?? 0,
              modified: result.modified_files ?? 0,
            })
          : t("No new or modified files to sync."),
      );
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setOperation(null);
    }
  };

  if (!supported) return null;

  const error = actionError || loadError || syncTask?.error;
  const progress = kb.progress ?? kb.statistics?.progress;
  const percent = Math.max(0, Math.min(100, resolveProgressPercent(progress)));
  const completed = syncTask && !syncTask.executing && !syncTask.error;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-[13px] font-medium text-[var(--foreground)]">
          <FolderSync className="h-4 w-4" />
          {t("Linked folders")}
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted-foreground)]">
          {t(
            "Upload folder imports a snapshot. Link a source folder here to import later changes with Sync now.",
          )}
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleLink();
        }}
        className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"
      >
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-[var(--foreground)]">
            {t("Folder path on the DeepTutor server")}
          </span>
          <input
            value={folderPath}
            onChange={(event) => setFolderPath(event.target.value)}
            disabled={busy}
            aria-describedby="linked-folder-path-help"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-[12.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)] disabled:opacity-50"
          />
        </label>
        <p
          id="linked-folder-path-help"
          className="text-[11.5px] text-[var(--muted-foreground)]"
        >
          {t(
            "Use a directory accessible to the backend. For Docker, use its mounted path inside the container.",
          )}
        </p>
        <button
          type="submit"
          disabled={busy || !folderPath.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-1.5 text-[12px] font-medium text-[var(--primary-foreground)] disabled:opacity-50"
        >
          {operation === "link" && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          )}
          {t("Link folder")}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50/60 p-3 text-[12px] text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300"
        >
          {error}
          {loadError && (
            <button type="button" onClick={refresh} className="ml-2 underline">
              {t("Retry")}
            </button>
          )}
        </div>
      )}
      {notice && !syncTask?.error && (
        <p role="status" className="text-[12px] text-[var(--muted-foreground)]">
          {completed ? t("Folder sync completed.") : notice}
        </p>
      )}
      {needsReindex && (
        <p className="text-[12px] text-amber-700 dark:text-amber-300">
          {t("Reindex this knowledge base before syncing new documents.")}
        </p>
      )}
      {indexing && (
        <div
          role="status"
          className="space-y-2 rounded-lg border border-[var(--border)] p-3"
        >
          <p className="flex items-center gap-2 text-[12px] text-[var(--foreground)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("Indexing in progress")}
          </p>
          <progress
            aria-label={t("Indexing progress")}
            value={percent}
            max={100}
            className="h-1.5 w-full accent-[var(--primary)]"
          />
          <p className="break-words text-[11.5px] text-[var(--muted-foreground)]">
            {progressMessage(progress ?? {}, t) ||
              task?.logs.at(-1) ||
              t("Waiting for backend indexing logs...")}
          </p>
        </div>
      )}

      {loading ? (
        <div
          role="status"
          className="flex items-center gap-2 py-4 text-[12px] text-[var(--muted-foreground)]"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("Loading linked folders…")}
        </div>
      ) : folders.length === 0 ? (
        !loadError && (
          <p className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center text-[12px] text-[var(--muted-foreground)]">
            {t("No linked folders yet.")}
          </p>
        )
      ) : (
        <ul className="space-y-3">
          {folders.map((folder) => (
            <li
              key={folder.id}
              className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-[12px] text-[var(--foreground)]">
                    {folder.path}
                  </p>
                  <p className="mt-1 text-[11.5px] text-[var(--muted-foreground)]">
                    {t("Files")}: {folder.file_count}
                  </p>
                  <p className="mt-1 text-[11.5px] text-[var(--muted-foreground)]">
                    {t("Last successful sync")}:{" "}
                    {formatKnowledgeTimestamp(folder.last_sync ?? undefined) ||
                      t("Never synced")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSync(folder.id)}
                    disabled={busy || needsReindex}
                    aria-label={t("Sync {{path}}", { path: folder.path })}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[12px] text-[var(--foreground)] disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t("Sync now")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmUnlink(folder.id)}
                    disabled={busy}
                    aria-label={t("Unlink {{path}}", { path: folder.path })}
                    className="rounded-md p-2 text-[var(--muted-foreground)] hover:text-red-600 disabled:opacity-50"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {confirmUnlink === folder.id && (
                <div className="space-y-2 border-t border-[var(--border)] pt-3">
                  <p className="text-[12px] text-[var(--muted-foreground)]">
                    {t(
                      "Unlinking stops future syncs. Imported documents stay in this knowledge base.",
                    )}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleUnlink(folder.id)}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-[12px] text-white disabled:opacity-50"
                    >
                      {t("Unlink folder")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmUnlink(null)}
                      className="rounded-md px-3 py-1.5 text-[12px] text-[var(--muted-foreground)]"
                    >
                      {t("Cancel")}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
        {t(
          "Sync imports new and modified files. Deleted source files remain in the knowledge base.",
        )}
      </p>
    </div>
  );
}
