import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileItem } from './models/fileItem';
import { ConfigManager } from './configManager';

export class CustomFileOrderProvider implements vscode.TreeDataProvider<FileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | null | void> = new vscode.EventEmitter<FileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private configManager: ConfigManager;
    private workspaceRoot: string;
    private treeView: vscode.TreeView<FileItem> | undefined;
    private clipboard: { uris: vscode.Uri[]; isCut: boolean } | null = null;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.configManager = ConfigManager.getInstance();
    }

    setTreeView(treeView: vscode.TreeView<FileItem>): void {
        this.treeView = treeView;
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
            const items: FileItem[] = [];
            const entries = fs.readdirSync(folderPath, { withFileTypes: true });

            // Filter out hidden files and system files unless explicitly shown
            const filteredEntries = entries.filter((entry: fs.Dirent) => {
                // Skip hidden files starting with . (except .vscode, .env, etc.)
                if (entry.name.startsWith('.')) {
                    const allowedHidden = ['.vscode', '.env', '.gitignore', '.gitattributes', '.prettierrc', '.eslintrc'];
                    return allowedHidden.some(allowed => entry.name.startsWith(allowed));
                }
                // Skip node_modules in root level unless it's specifically ordered
                if (entry.name === 'node_modules' && folderPath === this.workspaceRoot) {
                    const customOrder = this.configManager.getOrderForFolder(folderPath);
                    return customOrder.includes('node_modules');
                }
                // Skip common build/dist folders unless specifically ordered
                if (['dist', 'build', 'out', '.next', '.nuxt'].includes(entry.name)) {
                    const customOrder = this.configManager.getOrderForFolder(folderPath);
                    return customOrder.includes(entry.name);
                }
                return true;
            });

            // Convert entries to FileItems
            filteredEntries.forEach((entry: fs.Dirent) => {
                const fullPath = path.join(folderPath, entry.name);
                const isDirectory = entry.isDirectory();
                
                const item = new FileItem(
                    entry.name,
                    fullPath,
                    isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                    isDirectory,
                    folderPath
                );
                
                items.push(item);
            });

            // Apply custom ordering and update positions
            const orderedItems = this.applyCustomOrder(items, folderPath);
            orderedItems.forEach((item, index) => {
                item.position = index;
                // Mark folders with custom ordering
                const hasCustomOrder = this.configManager.getOrderForFolder(folderPath).length > 0;
                if (this.configManager.getShowCustomOrderIndicator()) {
                    item.updateContextValue(hasCustomOrder);
                }
            });

            return orderedItems;
        } catch (error) {
            vscode.window.showErrorMessage(`Error reading directory ${folderPath}: ${String(error)}`);
            return [];
        }
    }

    private applyCustomOrder(items: FileItem[], folderPath: string): FileItem[] {
        const customOrder = this.configManager.getOrderForFolder(folderPath);
        const defaultFoldersFirst = this.configManager.getDefaultFoldersFirst();
        
        if (customOrder.length === 0) {
            // Default sorting: folders first (if enabled), then alphabetical
            return items.sort((a, b) => {
                if (defaultFoldersFirst) {
                    if (a.isDirectory && !b.isDirectory) return -1;
                    if (!a.isDirectory && b.isDirectory) return 1;
                }
                return a.label.localeCompare(b.label);
            });
        }

        // Apply custom ordering
        const orderedItems: FileItem[] = [];
        const remainingItems = [...items];

        // First, add items in custom order
        customOrder.forEach((orderName: string) => {
            const index = remainingItems.findIndex((item: FileItem) => {
                // Support both exact match and glob-like patterns
                if (orderName.includes('*')) {
                    return this.matchesPattern(item.fileName, orderName);
                }
                return item.fileName === orderName;
            });
            
            if (index !== -1) {
                orderedItems.push(remainingItems.splice(index, 1)[0]);
            }
        });

        // Then add remaining items (folders first if enabled, then alphabetical)
        const sortedRemaining = remainingItems.sort((a: FileItem, b: FileItem) => {
            if (defaultFoldersFirst) {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
            }
            return a.label.localeCompare(b.label);
        });

        return [...orderedItems, ...sortedRemaining];
    }

    private matchesPattern(fileName: string, pattern: string): boolean {
        // Simple glob pattern matching
        const regex = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*');
        return new RegExp(`^${regex}$`).test(fileName);
    }

    // Reordering methods
    async moveItemUp(item: FileItem): Promise<void> {
        if (!item.parentPath) {
            vscode.window.showWarningMessage('Cannot move root level items');
            return;
        }
        
        try {
            const parentItem = new FileItem('', item.parentPath, vscode.TreeItemCollapsibleState.Expanded, true);
            const siblings = await this.getChildren(parentItem);
            const currentIndex = siblings.findIndex((sibling: FileItem) => sibling.fileName === item.fileName);
            
            if (currentIndex <= 0) {
                vscode.window.showInformationMessage('Item is already at the top');
                return;
            }
            
            // Create new order array
            const newOrder = siblings.map((s: FileItem) => s.fileName);
            [newOrder[currentIndex], newOrder[currentIndex - 1]] = [newOrder[currentIndex - 1], newOrder[currentIndex]];
            
            await this.configManager.setOrderForFolder(item.parentPath, newOrder);
            this.refresh();
            
            vscode.window.showInformationMessage(`Moved "${item.fileName}" up`);
        } catch (error) {
            vscode.window.showErrorMessage(`Error moving item: ${error}`);
        }
    }

    async moveItemDown(item: FileItem): Promise<void> {
        if (!item.parentPath) {
            vscode.window.showWarningMessage('Cannot move root level items');
            return;
        }
        
        try {
            const parentItem = new FileItem('', item.parentPath, vscode.TreeItemCollapsibleState.Expanded, true);
            const siblings = await this.getChildren(parentItem);
            const currentIndex = siblings.findIndex((sibling: FileItem) => sibling.fileName === item.fileName);
            
            if (currentIndex === -1 || currentIndex >= siblings.length - 1) {
                vscode.window.showInformationMessage('Item is already at the bottom');
                return;
            }
            
            // Create new order array
            const newOrder = siblings.map((s: FileItem) => s.fileName);
            [newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]];
            
            await this.configManager.setOrderForFolder(item.parentPath, newOrder);
            this.refresh();
            
            vscode.window.showInformationMessage(`Moved "${item.fileName}" down`);
        } catch (error) {
            vscode.window.showErrorMessage(`Error moving item: ${error}`);
        }
    }





    private async handleResetOrder(folderItem: FileItem): Promise<void> {
        const confirmation = await vscode.window.showWarningMessage(
            `Reset custom order for "${folderItem.fileName}" to default sorting?`,
            { modal: true },
            'Reset'
        );

        if (confirmation === 'Reset') {
            await this.configManager.resetOrderForFolder(folderItem.filePath);
            this.refresh();
            vscode.window.showInformationMessage(`Reset custom order for "${folderItem.fileName}"`);
        }
    }

    // Template methods


    // Utility methods
    async revealFileInExplorer(item: FileItem): Promise<void> {
        if (item && item.resourceUri) {
            try {
                await vscode.commands.executeCommand('revealFileInOS', item.resourceUri);
            } catch (error) {
                // Fallback to showing in VS Code explorer
                await vscode.commands.executeCommand('revealInExplorer', item.resourceUri);
            }
        }
    }

    async openFile(resource: vscode.Uri): Promise<void> {
        try {
            await vscode.window.showTextDocument(resource);
        } catch (error) {
            vscode.window.showErrorMessage(`Error opening file: ${error}`);
        }
    }

    // Get tree statistics
    getTreeStatistics(): { totalItems: number; customRules: number } {
        const rules = this.configManager.getOrderRules();
        const totalItems = this.countItemsRecursively(this.workspaceRoot);
        const customRules = Object.keys(rules).length;

        return {
            totalItems,
            customRules
        };
    }

    private countItemsRecursively(folderPath: string, depth: number = 0): number {
        if (depth > 3 || !fs.existsSync(folderPath)) return 0; // Limit recursion depth
        
        try {
            const entries = fs.readdirSync(folderPath, { withFileTypes: true });
            let count = entries.length;
            
            entries.forEach((entry: fs.Dirent) => {
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    count += this.countItemsRecursively(path.join(folderPath, entry.name), depth + 1);
                }
            });
            
            return count;
        } catch {
            return 0;
        }
    }

    // File operations
    async createFile(target?: FileItem): Promise<void> {
        const baseFolder = target && target.isDirectory ? target.filePath : (target ? target.parentPath || this.workspaceRoot : this.workspaceRoot);
        const name = await vscode.window.showInputBox({ prompt: 'New file name', placeHolder: 'example.ts' });
        if (!name) return;
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
        const baseFolder = target && target.isDirectory ? target.filePath : (target ? target.parentPath || this.workspaceRoot : this.workspaceRoot);
        const name = await vscode.window.showInputBox({ prompt: 'New folder name', placeHolder: 'new-folder' });
        if (!name) return;
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
        if (!newName || newName === item.fileName) return;
        const newUri = vscode.Uri.file(path.join(item.parentPath || this.workspaceRoot, newName));
        try {
            await vscode.workspace.fs.rename(item.resourceUri!, newUri, { overwrite: false });
            await this.updateOrderOnRename(item.parentPath || this.workspaceRoot, item.fileName, newName);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to rename: ${error}`);
        }
    }

    async deleteItems(items: readonly FileItem[]): Promise<void> {
        if (items.length === 0) return;
        const label = items.length === 1 ? items[0].fileName : `${items.length} items`;
        const confirm = await vscode.window.showWarningMessage(`Delete ${label}?`, { modal: true }, 'Delete');
        if (confirm !== 'Delete') return;
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
        this.clipboard = { uris: items.map(i => i.resourceUri!), isCut: false };
        vscode.window.setStatusBarMessage(`Copied ${items.length} item(s)`, 1500);
    }

    cutItems(items: readonly FileItem[]): void {
        this.clipboard = { uris: items.map(i => i.resourceUri!), isCut: true };
        vscode.window.setStatusBarMessage(`Cut ${items.length} item(s)`, 1500);
    }

    async pasteInto(target?: FileItem): Promise<void> {
        if (!this.clipboard || this.clipboard.uris.length === 0) return;
        const destFolder = target && target.isDirectory ? target.filePath : (target ? target.parentPath || this.workspaceRoot : this.workspaceRoot);
        try {
            for (const src of this.clipboard.uris) {
                const srcName = path.basename(src.fsPath);
                const destName = await this.generateNonConflictingName(destFolder, srcName);
                const destUri = vscode.Uri.file(path.join(destFolder, destName));
                await vscode.workspace.fs.copy(src, destUri, { overwrite: false });
                await this.updateOrderOnCreate(destFolder, destName);
            }
            if (this.clipboard.isCut) {
                for (const src of this.clipboard.uris) {
                    const parent = path.dirname(src.fsPath);
                    await vscode.workspace.fs.delete(src, { recursive: true, useTrash: false });
                    await this.updateOrderOnDelete(parent, path.basename(src.fsPath));
                }
            }
            this.clipboard = null;
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to paste: ${error}`);
        }
    }

    async copyPath(item: FileItem): Promise<void> {
        await vscode.env.clipboard.writeText(item.filePath);
        vscode.window.setStatusBarMessage('Path copied to clipboard', 1500);
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
        if (order && order.length >= 0) {
            const newOrder = [...order.filter(n => n !== name), name];
            await this.configManager.setOrderForFolder(folderPath, newOrder);
        }
    }

    private async updateOrderOnRename(folderPath: string, oldName: string, newName: string): Promise<void> {
        const order = this.configManager.getOrderForFolder(folderPath);
        if (order && order.length > 0) {
            const newOrder = order.map(n => (n === oldName ? newName : n));
            await this.configManager.setOrderForFolder(folderPath, newOrder);
        }
    }

    private async updateOrderOnDelete(folderPath: string, name: string): Promise<void> {
        const order = this.configManager.getOrderForFolder(folderPath);
        if (order && order.length > 0) {
            const newOrder = order.filter(n => n !== name);
            await this.configManager.setOrderForFolder(folderPath, newOrder);
        }
    }
}

