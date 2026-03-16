/**
 * eXide Desktop bridge — detects Tauri and exposes native capabilities.
 *
 * When running inside Tauri, provides:
 * - Local filesystem browsing (readDir, readFile, writeFile, etc.)
 * - Native file open/save dialogs
 * - Desktop detection flag for UI adaptation
 *
 * When running in a browser, this module is a no-op.
 */
eXide.namespace("eXide.desktop");

eXide.desktop = (function () {
    "use strict";

    var isDesktop = typeof window.__TAURI__ !== "undefined";
    var fs = null;
    var dialog = null;

    if (isDesktop) {
        try {
            fs = window.__TAURI__.fs
                || (window.__TAURI_PLUGIN_FS__ && window.__TAURI_PLUGIN_FS__);
            dialog = window.__TAURI__.dialog
                || (window.__TAURI_PLUGIN_DIALOG__ && window.__TAURI_PLUGIN_DIALOG__);
        } catch (e) {
            console.warn("[desktop-bridge] Failed to load Tauri plugins:", e);
            isDesktop = false;
        }
    }

    /**
     * Read directory contents. Returns array of { name, isDir, isFile, path }.
     */
    async function readDir(path) {
        if (!fs) return [];
        try {
            var entries = await fs.readDir(path);
            return entries.map(function (entry) {
                return {
                    name: entry.name,
                    isDir: entry.isDirectory,
                    isFile: entry.isFile,
                    path: path + "/" + entry.name
                };
            }).sort(function (a, b) {
                // Directories first, then alphabetical
                if (a.isDir && !b.isDir) return -1;
                if (!a.isDir && b.isDir) return 1;
                return a.name.localeCompare(b.name);
            });
        } catch (e) {
            console.warn("[desktop-bridge] readDir failed:", path, e);
            return [];
        }
    }

    /**
     * Read file contents as text.
     */
    async function readFile(path) {
        if (!fs) return null;
        try {
            return await fs.readTextFile(path);
        } catch (e) {
            console.warn("[desktop-bridge] readFile failed:", path, e);
            return null;
        }
    }

    /**
     * Write text content to a file.
     */
    async function writeFile(path, content) {
        if (!fs) return false;
        try {
            await fs.writeTextFile(path, content);
            return true;
        } catch (e) {
            console.warn("[desktop-bridge] writeFile failed:", path, e);
            return false;
        }
    }

    /**
     * Show native folder picker dialog. Returns selected path or null.
     */
    async function pickFolder() {
        if (!dialog) return null;
        try {
            return await dialog.open({
                directory: true,
                multiple: false,
                title: "Open Project Folder"
            });
        } catch (e) {
            return null;
        }
    }

    /**
     * Show native file open dialog. Returns selected path(s) or null.
     */
    async function pickFile(options) {
        if (!dialog) return null;
        try {
            return await dialog.open(Object.assign({
                multiple: false,
                title: "Open File"
            }, options || {}));
        } catch (e) {
            return null;
        }
    }

    /**
     * Show native file save dialog. Returns selected path or null.
     */
    async function pickSaveFile(options) {
        if (!dialog) return null;
        try {
            return await dialog.save(Object.assign({
                title: "Save File"
            }, options || {}));
        } catch (e) {
            return null;
        }
    }

    return {
        isDesktop: isDesktop,
        readDir: readDir,
        readFile: readFile,
        writeFile: writeFile,
        pickFolder: pickFolder,
        pickFile: pickFile,
        pickSaveFile: pickSaveFile
    };
}());
