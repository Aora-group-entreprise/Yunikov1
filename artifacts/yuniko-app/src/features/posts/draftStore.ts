const DB_NAME = "yuniko-post-drafts";
const DB_VERSION = 1;
const STORE_NAME = "drafts";

export type PostDraftMedia = {
  id: string;
  file: File;
  name: string;
  contentType: string;
  size: number;
};

export type PostDraft = {
  id: string;
  caption: string;
  visibility: "public" | "followers" | "private";
  media: PostDraftMedia[];
  updatedAt: number;
};

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexeddb_unavailable"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
  });
}

export async function savePostDraft(draft: PostDraft): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(draft);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("draft_save_failed"));
  });
  db.close();
}

export async function loadPostDraft(id: string): Promise<PostDraft | null> {
  const db = await openDatabase();
  const draft = await new Promise<PostDraft | null>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve((request.result as PostDraft | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("draft_load_failed"));
  });
  db.close();
  return draft;
}

export async function deletePostDraft(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("draft_delete_failed"));
  });
  db.close();
}
