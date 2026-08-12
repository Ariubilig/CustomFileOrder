import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileItem } from './models/fileItem';
import { ConfigManager } from './configManager';
import { applyOrder, restoreToDefaultPosition } from './ordering';

/** Dot-entries worth showing; everything else starting with `.` stays hidden. */
const ALLOWED_HIDDEN = ['.vscode', '.env', '.gitignore', '.gitattributes', '.prettierrc', '.eslintrc'];

/** Generated output folders, shown only when explicitly ordered. */
const GENERATED_FOLDERS = ['dist', 'build', 'out', '.next', '.nuxt'];

/** Drives the `when` clause that hides Paste while the clipboard is empty. */
const CLIPBOARD_CONTEXT = 'customFileOrder.hasClipboard';

export class CustomFileOrderProvider implements vscode.TreeDataProvider<FileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | null | void> = new vscode.EventEmitter<FileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private configManager: ConfigManager;
    private workspaceRoot: string;
    private clipboard: { uris: vscode.Uri[]; isCut: boolean } | null = null;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.configManager = ConfigManager.getInstance();
    }

    refresh(): void {
        this.configManager.refresh();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FileItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: FileItem): Promise<FileItem[]> {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage('No workspace folder');
            return Promise.resolve([]);
        }

        const folderPath = element ? element.filePath : this.workspaceRoot;
        return Promise.resolve(this.getFilesAndFolders(folderPath));
    }

    private getFilesAndFolders(folderPath: string): FileItem[] {
        if (!fs.existsSync(folderPath)) {
            return [];
        }

        try {
            const customOrder = this.configManager.getOrderForFolder(folderPath);
            const entries = fs.readdirSync(folderPath, { withFileTypes: true })
                .filter((entry: fs.Dirent) => this.isVisible(entry, folderPath, customOrder))
                .map((entry: fs.Dirent) => ({ name: entry.name, isDirectory: entry.isDirectory() }));

            const ordered = applyOrder(entries, customOrder, this.configManager.getDefaultFoldersFirst());
            const showIndicator = this.configManager.getShowCustomOrderIndicator();

            return ordered.map((entry, index) => {
                const fullPath = path.join(folderPath, entry.name);
                const item = new FileItem(
                    entry.name,
                    fullPath,
                    entry.isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                    entry.isDirectory,
                    folderPath
                );
                item.position = index;

                if (showIndicator && entry.isDirectory) {
                    // A folder is marked when it carries its own rule, not when
                    // its parent happens to have one.
                    item.updateContextValue(this.configManager.getOrderForFolder(fullPath).length > 0);
                }

                return item;
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error reading directory ${folderPath}: ${String(error)}`);
            return [];
        }
    }

    private isVisible(entry: fs.Dirent, folderPath: string, customOrder: string[]): boolean {
        if (entry.name.startsWith('.')) {
            return ALLOWED_HIDDEN.some(allowed => entry.name.startsWith(allowed));
        }
        if (entry.name === 'node_modules' && folderPath === this.workspaceRoot) {
            return customOrder.includes(entry.name);
        }
        if (GENERATED_FOLDERS.includes(entry.name)) {
            return customOrder.includes(entry.name);
        }
        return true;
    }

    // Reordering methods
    async moveItemUp(item: FileItem): Promise<void> {
        await this.moveItem(item, -1);
    }

    async moveItemDown(item: FileItem): Promise<void> {
        await this.moveItem(item, 1);
    }

    private async moveItem(item: FileItem, offset: number): Promise<void> {
        if (!item?.parentPath) {
            vscode.window.showWarningMessage('Cannot move root level items');
            return;
        }

        try {
            const siblings = this.getFilesAndFolders(item.parentPath);
            const currentIndex = siblings.findIndex((sibling: FileItem) => sibling.fileName === item.fileName);
            if (currentIndex === -1) {
                return;
            }

            const targetIndex = currentIndex + offset;
            if (targetIndex < 0) {
                vscode.window.showInformationMessage('Item is already at the top');
                return;
            }
            if (targetIndex >= siblings.length) {
                vscode.window.showInformationMessage('Item is already at the bottom');
                return;
            }

            const newOrder = siblings.map((sibling: FileItem) => sibling.fileName);
            [newOrder[currentIndex], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[currentIndex]];

            await this.configManager.setOrderForFolder(item.parentPath, newOrder);
            this.refresh();

            vscode.window.showInformationMessage(`Moved "${item.fileName}" ${offset < 0 ? 'up' : 'down'}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Error moving item: ${error}`);
        }
    }

    /** Put one item back where default sorting would place it. */
    async restoreItemPosition(item: FileItem): Promise<void> {
        const parentPath = item?.parentPath;
        if (!parentPath) {
            return;
        }

        const order = this.configManager.getOrderForFolder(parentPath);
        if (order.length === 0) {
            // The folder already uses default sorting, so there is nothing to undo.
            return;
        }

        try {
            const directories = new Set(
                fs.readdirSync(parentPath, { withFileTypes: true })
                    .filter((entry: fs.Dirent) => entry.isDirectory())
                    .map((entry: fs.Dirent) => entry.name)
            );

            const newOrder = restoreToDefaultPosition(
                order,
                { name: item.fileName, isDirectory: item.isDirectory },
                (name: string) => directories.has(name),
                this.configManager.getDefaultFoldersFirst()
            );

            await this.configManager.setOrderForFolder(parentPath, newOrder);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Error restoring item: ${error}`);
        }
    }

    // File operations
    async createFile(target?: FileItem): Promise<void> {
        const baseFolder = this.resolveFolder(target);
        const name = await vscode.window.showInputBox({ prompt: 'New file name', placeHolder: 'example.ts' });
        if (!name) {
            return;
        }

        const newUri = vscode.Uri.file(path.join(baseFolder, name));
        try {
            await vscode.workspace.fs.writeFile(newUri, new Uint8Array());
            await this.updateOrderOnCreate(baseFolder, name);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create file: ${error}`);
        }
    }

    async createFolder(target?: FileItem): Promise<void> {
        const baseFolder = this.resolveFolder(target);
        const name = await vscode.window.showInputBox({ prompt: 'New folder name', placeHolder: 'new-folder' });
        if (!name) {
            return;
        }

        const newUri = vscode.Uri.file(path.join(baseFolder, name));
        try {
            await vscode.workspace.fs.createDirectory(newUri);
            await this.updateOrderOnCreate(baseFolder, name);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create folder: ${error}`);
        }
    }

    async renameItem(item: FileItem): Promise<void> {
        const newName = await vscode.window.showInputBox({ prompt: 'Rename', value: item.fileName });
        if (!newName || newName === item.fileName) {
            return;
        }

        const parentPath = item.parentPath || this.workspaceRoot;
        const newUri = vscode.Uri.file(path.join(parentPath, newName));
        try {
            await vscode.workspace.fs.rename(item.resourceUri!, newUri, { overwrite: false });
            await this.updateOrderOnRename(parentPath, item.fileName, newName);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to rename: ${error}`);
        }
    }

    async deleteItems(items: readonly FileItem[]): Promise<void> {
        if (items.length === 0) {
            return;
        }

        const label = items.length === 1 ? items[0].fileName : `${items.length} items`;
        const confirm = await vscode.window.showWarningMessage(`Delete ${label}?`, { modal: true }, 'Delete');
        if (confirm !== 'Delete') {
            return;
        }

        try {
            for (const item of items) {
                await vscode.workspace.fs.delete(item.resourceUri!, { recursive: true, useTrash: true });
                await this.updateOrderOnDelete(item.parentPath || this.workspaceRoot, item.fileName);
            }
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete: ${error}`);
        }
    }

    async duplicateItems(items: readonly FileItem[]): Promise<void> {
        for (const item of items) {
            const destDir = item.parentPath || this.workspaceRoot;
            const newName = await this.generateCopyName(destDir, item.fileName);
            const destUri = vscode.Uri.file(path.join(destDir, newName));
            try {
                await vscode.workspace.fs.copy(item.resourceUri!, destUri, { overwrite: false });
                await this.updateOrderOnCreate(destDir, newName);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to duplicate "${item.fileName}": ${error}`);
            }
        }
        this.refresh();
    }

    copyItems(items: readonly FileItem[]): void {
        if (items.length === 0) {
            return;
        }
        this.setClipboard(items, false);
        vscode.window.setStatusBarMessage(`Copied ${items.length} item(s)`, 1500);
    }

    cutItems(items: readonly FileItem[]): void {
        if (items.length === 0) {
            return;
        }
        this.setClipboard(items, true);
        vscode.window.setStatusBarMessage(`Cut ${items.length} item(s)`, 1500);
    }

    async pasteInto(target?: FileItem): Promise<void> {
        if (!this.clipboard || this.clipboard.uris.length === 0) {
            return;
        }

        const { uris, isCut } = this.clipboard;
        const destFolder = this.resolveFolder(target);

        try {
            for (const source of uris) {
                const sourceFolder = path.dirname(source.fsPath);
                const sourceName = path.basename(source.fsPath);
                if (isCut && sourceFolder === destFolder) {
                    continue;
                }

                const destName = await this.generateNonConflictingName(destFolder, sourceName);
                const destUri = vscode.Uri.file(path.join(destFolder, destName));

                if (isCut) {
                    // A move, so a failure never leaves the source deleted.
                    await vscode.workspace.fs.rename(source, destUri, { overwrite: false });
                    await this.updateOrderOnDelete(sourceFolder, sourceName);
                } else {
                    await vscode.workspace.fs.copy(source, destUri, { overwrite: false });
                }

                await this.updateOrderOnCreate(destFolder, destName);
            }

            if (isCut) {
                this.clearClipboard();
            }
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to paste: ${error}`);
        }
    }

    async copyPath(item: FileItem): Promise<void> {
        await vscode.env.clipboard.writeText(item.filePath);
        vscode.window.setStatusBarMessage('Path copied to clipboard', 1500);
    }

    async copyRelativePath(item: FileItem): Promise<void> {
        const relative = path.relative(this.workspaceRoot, item.filePath);
        // Anything outside the workspace has no useful relative form.
        const value = !relative || relative.startsWith('..') ? item.filePath : relative;

        await vscode.env.clipboard.writeText(value);
        vscode.window.setStatusBarMessage('Relative path copied to clipboard', 1500);
    }

    async openToSide(item: FileItem): Promise<void> {
        if (item.isDirectory) {
            return;
        }

        try {
            await vscode.window.showTextDocument(item.resourceUri!, { viewColumn: vscode.ViewColumn.Beside });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open file: ${error}`);
        }
    }

    /** Opens a terminal in the folder itself, or in a file's parent folder. */
    async openInTerminal(target?: FileItem): Promise<void> {
        const folder = this.resolveFolder(target);
        try {
            // Prefer the built-in command so the user's terminal profile applies.
            await vscode.commands.executeCommand('openInIntegratedTerminal', vscode.Uri.file(folder));
        } catch {
            vscode.window.createTerminal({ cwd: folder, name: path.basename(folder) }).show();
        }
    }

    private setClipboard(items: readonly FileItem[], isCut: boolean): void {
        this.clipboard = { uris: items.map(item => item.resourceUri!), isCut };
        void vscode.commands.executeCommand('setContext', CLIPBOARD_CONTEXT, true);
    }

    private clearClipboard(): void {
        this.clipboard = null;
        void vscode.commands.executeCommand('setContext', CLIPBOARD_CONTEXT, false);
    }

    /** The folder an action should act on: the item itself, or its parent. */
    private resolveFolder(target?: FileItem): string {
        if (!target) {
            return this.workspaceRoot;
        }
        return target.isDirectory ? target.filePath : (target.parentPath || this.workspaceRoot);
    }

    private async generateCopyName(folderPath: string, baseName: string): Promise<string> {
        const ext = path.extname(baseName);
        const nameOnly = ext ? baseName.slice(0, -ext.length) : baseName;
        let counter = 1;
        while (true) {
            const candidate = `${nameOnly} copy${counter > 1 ? ' ' + counter : ''}${ext}`;
            const candidateUri = vscode.Uri.file(path.join(folderPath, candidate));
            try {
                await vscode.workspace.fs.stat(candidateUri);
                counter++;
            } catch {
                return candidate;
            }
        }
    }

    private async generateNonConflictingName(folderPath: string, baseName: string): Promise<string> {
        let name = baseName;
        let counter = 1;
        while (true) {
            const candidateUri = vscode.Uri.file(path.join(folderPath, name));
            try {
                await vscode.workspace.fs.stat(candidateUri);
                const ext = path.extname(baseName);
                const nameOnly = ext ? baseName.slice(0, -ext.length) : baseName;
                name = `${nameOnly} (${counter++})${ext}`;
            } catch {
                return name;
            }
        }
    }

    private async updateOrderOnCreate(folderPath: string, name: string): Promise<void> {
        const order = this.configManager.getOrderForFolder(folderPath);
        // Folders without a rule stay on default sorting; adding a file should
        // not quietly opt them into a custom order.
        if (order.length === 0 || order.includes(name)) {
            return;
        }
        await this.configManager.setOrderForFolder(folderPath, [...order, name]);
    }

    private async updateOrderOnRename(folderPath: string, oldName: string, newName: string): Promise<void> {
        const order = this.configManager.getOrderForFolder(folderPath);
        if (order.length === 0 || !order.includes(oldName)) {
            return;
        }
        await this.configManager.setOrderForFolder(folderPath, order.map(n => (n === oldName ? newName : n)));
    }

    private async updateOrderOnDelete(folderPath: string, name: string): Promise<void> {
        const order = this.configManager.getOrderForFolder(folderPath);
        if (order.length === 0 || !order.includes(name)) {
            return;
        }
        await this.configManager.setOrderForFolder(folderPath, order.filter(n => n !== name));
    }
}
