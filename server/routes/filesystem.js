/**
 * Filesystem Routes — /api/fs/*
 *
 * Handles native filesystem operations:
 * - Folder picker (via PowerShell dialog on Windows)
 * - Course folder scanning
 * - Path repair trigger
 */

import express from 'express'
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { getOne, run } from '../database.js'
import { scanCourseFolder } from '../services/courseScanner.js'
import { repairPaths } from '../services/pathRepair.js'
import { addAllowedRoot, setAllowedRoots } from '../services/videoStreamer.js'

const router = express.Router()

// GET /api/fs/pick-folder
// Opens a native OS folder picker and returns the selected path
router.get('/pick-folder', async (req, res) => {
    try {
        const selectedPath = await openFolderDialog()
        if (!selectedPath) {
            return res.json({ path: null, name: null }) // User cancelled
        }
        const name = path.basename(selectedPath)
        // Add to allowed streaming roots
        addAllowedRoot(selectedPath)
        addAllowedRoot(path.dirname(selectedPath))
        res.json({ path: selectedPath, name })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/fs/scan
// Scans a course folder and returns structured module/video data
router.post('/scan', async (req, res) => {
    const { path: folderPath, autoDetectThumbnails } = req.body
    if (!folderPath) {
        return res.status(400).json({ error: 'Missing path' })
    }
    if (!fs.existsSync(folderPath)) {
        return res.status(404).json({ error: 'Folder not found' })
    }

    try {
        const result = await scanCourseFolder(folderPath, undefined, autoDetectThumbnails)
        res.json(result)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/fs/repair-paths
// Triggers a scan to fix missing/broken file paths in the database
router.post('/repair-paths', (req, res) => {
    try {
        const result = repairPaths()
        res.json({ success: true, result })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/fs/set-root
// Updates the allowed root folder for video streaming
router.post('/set-root', (req, res) => {
    const { rootPath } = req.body
    if (!rootPath) {
        return res.status(400).json({ error: 'Missing rootPath' })
    }
    try {
        run(
            `INSERT INTO settings (key, value) VALUES (?, ?) 
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            ['root_folder_path', JSON.stringify(rootPath)]
        )
        setAllowedRoots([rootPath])
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Opens a native folder-picker dialog.
 * On Windows: uses the modern File Explorer dialog (Vista+ style).
 * On macOS/Linux: uses osascript / zenity.
 */
function openFolderDialog() {
    return new Promise((resolve, reject) => {
        const platform = process.platform

        if (platform === 'win32') {
            // Use the modern File Explorer folder picker via COM interop
            // This produces the full Windows Explorer dialog, not the legacy tree view
            const script = [
                '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
                'Add-Type -AssemblyName System.Windows.Forms',
                '[System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms") | Out-Null',
                '$ofd = New-Object Microsoft.Win32.OpenFileDialog',
                // Trick: use a fake filename filter to make it act as a folder picker
                // The modern approach that works on all Windows 10/11:
                'Add-Type @"',
                'using System;',
                'using System.Runtime.InteropServices;',
                '[ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]',
                'class FileOpenDialogRCW {}',
                '',
                '[ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
                'interface IFileDialog {',
                '    [PreserveSig] int Show([In] IntPtr hwndOwner);',
                '    void SetFileTypes();',
                '    void SetFileTypeIndex();',
                '    void GetFileTypeIndex();',
                '    void Advise();',
                '    void Unadvise();',
                '    void SetOptions([In] uint fos);',
                '    void GetOptions(out uint fos);',
                '    void SetDefaultFolder();',
                '    void SetFolder();',
                '    void GetFolder();',
                '    void GetCurrentSelection();',
                '    void SetFileName();',
                '    void GetFileName();',
                '    void SetTitle([In, MarshalAs(UnmanagedType.LPWStr)] string pszTitle);',
                '    void SetOkButtonLabel();',
                '    void SetFileNameLabel();',
                '    void GetResult(out IShellItem ppsi);',
                '    void AddPlace();',
                '    void SetDefaultExtension();',
                '    void Close();',
                '    void SetClientGuid();',
                '    void ClearClientData();',
                '    void SetFilter();',
                '}',
                '',
                '[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
                'interface IShellItem {',
                '    void BindToHandler();',
                '    void GetParent();',
                '    void GetDisplayName([In] uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);',
                '    void GetAttributes();',
                '    void Compare();',
                '}',
                '',
                'public class FolderPicker {',
                '    public static string Show(string title) {',
                '        var dialog = (IFileDialog)new FileOpenDialogRCW();',
                '        dialog.SetOptions(0x00000020); // FOS_PICKFOLDERS',
                '        dialog.SetTitle(title);',
                '        int hr = dialog.Show(IntPtr.Zero);',
                '        if (hr != 0) return null;',
                '        IShellItem item;',
                '        dialog.GetResult(out item);',
                '        string path;',
                '        item.GetDisplayName(0x80058000, out path);',
                '        return path;',
                '    }',
                '}',
                '"@',
                '$result = [FolderPicker]::Show("Select Course Folder")',
                'if ($result) { Write-Output $result }'
            ].join('\n')

            execFile('powershell', ['-NoProfile', '-Command', script], { timeout: 120000 }, (err, stdout) => {
                if (err) return reject(err)
                const selected = stdout.trim()
                resolve(selected || null)
            })
        } else if (platform === 'darwin') {
            execFile('osascript', ['-e', 'POSIX path of (choose folder)'], (err, stdout) => {
                if (err) return resolve(null) // User cancelled
                resolve(stdout.trim() || null)
            })
        } else {
            // Linux: try zenity
            execFile('zenity', ['--file-selection', '--directory'], (err, stdout) => {
                if (err) return resolve(null)
                resolve(stdout.trim() || null)
            })
        }
    })
}
