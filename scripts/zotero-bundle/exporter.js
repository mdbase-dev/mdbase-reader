/* Standalone Zotero script: load with Services.scriptloader.loadSubScript(url, scope).
 * No network access, collection writes, or mdbase dependencies. */
// Exposed to the scope supplied by Zotero's loadSubScript, not imported as an ES module.
// eslint-disable-next-line no-unused-vars
var ReaderZoteroBundle = (() => {
  "use strict";
  const format = "dev.mdbase.reader.zotero-bundle";
  const segment = (s) => {
    if (
      !s ||
      s === "." ||
      s === ".." ||
      /[/\\:]/u.test(s) ||
      [...s].some((c) => c.charCodeAt(0) < 32)
    ) {
      throw new Error("Unsafe file path component");
    }
    return s;
  };
  const stable = (rows) => JSON.stringify(rows.slice().sort((a, b) => a.key.localeCompare(b.key)));

  async function exportLibrary(adapter, { destination, signal, onProgress = () => {} }) {
    const check = () => {
      if (signal?.aborted) throw new Error("Export cancelled");
    };
    check();
    // The adapter MUST create exclusively: existing/partial bundles are never overwritten.
    const before = await adapter.snapshot();
    if (before.syncing) throw new Error("Wait for Zotero sync to finish");
    await adapter.createDestination(destination);
    const manifest = {
      format,
      version: 1,
      status: "exporting",
      startedAt: new Date().toISOString(),
      source: before.source,
      scope: "whole-library-excluding-trash",
      counts: {},
      files: [],
      warnings: [],
    };
    const json = (name, data) => adapter.writeJSON(destination, name, data);
    try {
      await json("manifest.json", manifest);
      const { items, notes, annotations, attachments, collections } = before;
      const all = [...items, ...notes, ...annotations, ...attachments];
      const keys = new Set(all.map((x) => x.key));
      if (keys.size !== all.length) throw new Error("Duplicate item keys");
      const collectionKeys = new Set(collections.map((x) => x.key));
      for (const row of all) {
        segment(row.key);
        if (row.zotero.parentItem && !keys.has(row.zotero.parentItem)) {
          manifest.warnings.push({
            code: "missing-parent",
            key: row.key,
            parent: row.zotero.parentItem,
          });
        }
        for (const key of row.zotero.collections || []) {
          if (!collectionKeys.has(key)) throw new Error("Unresolved collection membership");
        }
      }
      for (const c of collections) {
        segment(c.key);
        if (c.zotero.parentCollection && !collectionKeys.has(c.zotero.parentCollection)) {
          throw new Error("Unresolved parent collection");
        }
      }
      for (const row of items) {
        if (!row.csl) manifest.warnings.push({ code: "csl-unavailable", key: row.key });
      }
      for (const [name, rows] of Object.entries({ items, notes, annotations, collections })) {
        await json(`${name}.json`, rows);
        manifest.counts[name] = rows.length;
      }
      const results = [];
      for (const attachment of attachments) {
        check();
        const out = { ...attachment, status: "missing", path: null, files: [] };
        const payload = await adapter.attachmentFiles(attachment.key);
        if (payload.status !== "available") {
          out.status = payload.status;
          if (payload.status !== "linked-url") {
            manifest.warnings.push({ code: payload.status, key: attachment.key });
          }
        } else {
          if (!payload.files.length) throw new Error("Available attachment has no files");
          const seen = new Set();
          for (const file of payload.files) {
            check();
            const relative = file.relative.split("/").map(segment).join("/");
            if (seen.has(relative)) throw new Error("Duplicate attachment payload path");
            seen.add(relative);
            const path = `files/${attachment.key}/${relative}`;
            const receipt = await adapter.copyVerified(file.source, destination, path);
            const entry = { path, bytes: receipt.bytes, sha256: receipt.sha256 };
            manifest.files.push(entry);
            out.files.push(path);
          }
          const primary = payload.primary.split("/").map(segment).join("/");
          if (!seen.has(primary)) throw new Error("Attachment primary file missing from payload");
          out.path = `files/${attachment.key}/${primary}`;
          out.status = "available";
        }
        results.push(out);
        onProgress({ completed: results.length, total: attachments.length, key: attachment.key });
      }
      await json("attachments.json", results);
      manifest.counts.attachments = results.length;
      manifest.counts.availableAttachments = results.filter((x) => x.status === "available").length;
      manifest.counts.missingAttachments = results.filter(
        (x) => !["available", "linked-url"].includes(x.status),
      ).length;
      manifest.counts.files = manifest.files.length;
      // Detect edits, additions, deletions, collection changes and sync during extraction.
      check();
      const after = await adapter.snapshot();
      if (after.syncing || stable(before.fingerprints) !== stable(after.fingerprints)) {
        throw new Error("Library changed during export; repeat into a new destination");
      }
      manifest.status = manifest.warnings.length ? "complete-with-warnings" : "complete";
      manifest.completedAt = new Date().toISOString();
      await json("manifest.json", manifest);
      return manifest;
    } catch (error) {
      manifest.status = signal?.aborted ? "cancelled" : "failed";
      // Avoid embedding local paths or exception payloads in portable metadata.
      manifest.failure = "Export did not complete. Do not import this bundle.";
      await json("manifest.json", manifest);
      throw error;
    }
  }

  function createZoteroAdapter({ Zotero, IOUtils, PathUtils }) {
    const libraryID = Zotero.Libraries.userLibraryID;
    let liveItems;
    // Native asynchronous hashing keeps Zotero responsive on large files.
    const hash = (path) => IOUtils.computeHexDigest(path, "sha256");
    const safeFile = (path) => {
      let file = Zotero.File.pathToFile(path);
      // Reject symlinks in ANY component, not just the final file.
      while (file) {
        if (file.isSymlink()) throw new Error("Symlink paths are not supported by this exporter");
        file = file.parent;
      }
    };
    return {
      async snapshot() {
        const userID = Zotero.Users.getCurrentUserID();
        if (!userID) throw new Error("Sign in to Zotero and finish syncing before exporting.");
        liveItems = await Zotero.Items.getAll(libraryID, false, false);
        const result = {
          source: { application: "Zotero", version: Zotero.version, library: `user:${userID}` },
          syncing: Zotero.Sync.Runner.syncInProgress,
          items: [],
          notes: [],
          annotations: [],
          attachments: [],
          collections: [],
          fingerprints: [],
        };
        for (const item of liveItems) {
          const raw = item.toJSON();
          result.fingerprints.push({ key: `item:${item.key}`, raw });
          const zotero = { ...raw };
          // Do not leak original machine paths into a portable bundle.
          delete zotero.path;
          const row = { key: item.key, zotero };
          if (item.isRegularItem()) {
            try {
              row.csl = Zotero.Utilities.Item.itemToCSLJSON(item);
            } catch {
              row.csl = null;
            }
            result.items.push(row);
          } else if (item.isNote()) result.notes.push(row);
          else if (item.isAnnotation()) result.annotations.push(row);
          else if (item.isAttachment()) result.attachments.push(row);
          else throw new Error("Unsupported Zotero item category");
        }
        for (const c of Zotero.Collections.getByLibrary(libraryID, true, false)) {
          const raw = c.toJSON();
          result.collections.push({ key: c.key, zotero: raw });
          result.fingerprints.push({ key: `collection:${c.key}`, raw });
        }
        return result;
      },
      async availableBytes(parent) {
        safeFile(parent);
        const folder = Zotero.File.pathToFile(parent);
        const data = Zotero.File.pathToFile(Zotero.DataDirectory.dir);
        folder.normalize();
        data.normalize();
        if (data.equals(folder) || data.contains(folder)) {
          throw new Error("Choose a folder outside Zotero's data directory.");
        }
        return folder.diskSpaceAvailable;
      },
      async createDestination(destination) {
        await this.availableBytes(PathUtils.parent(destination));
        await IOUtils.makeDirectory(destination, { ignoreExisting: false });
      },
      async writeJSON(destination, name, value) {
        const path = PathUtils.join(destination, segment(name));
        await IOUtils.writeUTF8(path, JSON.stringify(value, null, 2) + "\n", {
          tmpPath: path + ".tmp",
        });
      },
      async attachmentFiles(key) {
        const item = liveItems.find((x) => x.key === key);
        if (item.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_URL) {
          return { status: "linked-url" };
        }
        const path = await item.getFilePathAsync();
        if (!path || !(await IOUtils.exists(path))) return { status: "missing-file" };
        safeFile(path);
        const primary = PathUtils.filename(path);
        const files = [];
        // Preserve HTML snapshot support files; don't traverse unrelated linked-file folders.
        const snapshot =
          item.attachmentContentType === "text/html" &&
          item.attachmentLinkMode !== Zotero.Attachments.LINK_MODE_LINKED_FILE;
        async function walk(dir, prefix = "") {
          for (const child of (await IOUtils.getChildren(dir)).sort()) {
            const name = segment(PathUtils.filename(child));
            if (name.startsWith(".zotero")) continue; // Disposable Zotero caches
            safeFile(child);
            const info = await IOUtils.stat(child);
            if (info.type === "directory") await walk(child, prefix + name + "/");
            else if (info.type === "regular")
              files.push({ source: child, relative: prefix + name });
            else throw new Error("Unsupported snapshot file type");
          }
        }
        if (snapshot) await walk(PathUtils.parent(path));
        else files.push({ source: path, relative: primary });
        for (const file of files) file.bytes = (await IOUtils.stat(file.source)).size;
        return { status: "available", primary, files };
      },
      async copyVerified(source, destination, relative) {
        safeFile(source);
        const path = PathUtils.join(destination, ...relative.split("/"));
        await IOUtils.makeDirectory(PathUtils.parent(path), { createAncestors: true });
        const before = await IOUtils.stat(source);
        const digest = await hash(source);
        await IOUtils.copy(source, path, { noOverwrite: true });
        const after = await IOUtils.stat(source);
        const copied = await IOUtils.stat(path);
        if (
          before.size !== after.size ||
          before.lastModified !== after.lastModified ||
          copied.size !== before.size ||
          (await hash(path)) !== digest ||
          (await hash(source)) !== digest
        ) {
          throw new Error("File changed or copy verification failed");
        }
        return { bytes: copied.size, sha256: digest };
      },
    };
  }
  return { exportLibrary, createZoteroAdapter };
})();
