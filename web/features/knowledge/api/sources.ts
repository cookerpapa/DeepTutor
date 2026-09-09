export {
  addGitHubSource,
  addWebSource,
  listGitHubSources,
  listLinkedFolders,
  linkLocalFolder,
  unlinkLocalFolder,
  syncLinkedFolder,
  listWebSources,
  removeGitHubSource,
  removeWebSource,
  syncGitHubSources,
  syncWebSources,
} from "./client";

export type {
  AddGitHubSourcePayload,
  AddWebSourcePayload,
  GitHubSource,
  GitHubSyncResult,
  LinkedFolder,
  LinkedFolderSyncResult,
  WebSource,
  WebSyncResult,
  WebSyncSourceResult,
} from "../model/types";
