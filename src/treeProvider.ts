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

    getChildren(element?: FileItem): Thenable<FileItem[]> {
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

        const items: FileItem[] = [];
        const entries = fs.readdirSync(folderPath, { withFileTypes: true });

        // Convert entries to FileItems
        entries.forEach(entry => {
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
            item.updateContextValue(hasCustomOrder);
        });

        return orderedItems;
    }

    private applyCustomOrder(items: FileItem[], folderPath: string): FileItem[] {
        const customOrder = this.configManager.getOrderForFolder(folderPath);
        
        if (customOrder.length === 0) {
            // Default sorting: folders first, then alphabetical
            return items.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.label.localeCompare(b.label);
            });
        }

        // Apply custom ordering
        const orderedItems: FileItem[] = [];
        const remainingItems = [...items];

        // First, add items in custom order
        customOrder.forEach(orderName => {
            const index = remainingItems.findIndex(item => item.fileName === orderName);
            if (index !== -1) {
                orderedItems.push(remainingItems.splice(index, 1)[0]);
            }
        });

        // Then add remaining items (folders first, then alphabetical)
        const sortedRemaining = remainingItems.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.label.localeCompare(b.label);
        });

        return [...orderedItems, ...sortedRemaining];
    }

    // New methods for reordering
    async moveItemUp(item: FileItem): Promise<void> {
        if (!item.parentPath) return;
        
        const siblings = await this.getChildren(new FileItem('', item.parentPath, vscode.TreeItemCollapsibleState.Expanded, true));
        const currentIndex = siblings.findIndex(sibling => sibling.fileName === item.fileName);
        
        if (currentIndex <= 0) return; // Already at top or not found
        
        // Swap with previous item
        const newOrder = siblings.map(s => s.fileName);
        [newOrder[currentIndex], newOrder[currentIndex - 1]] = [newOrder[currentIndex - 1], newOrder[currentIndex]];
        
        await this.configManager.setOrderForFolder(item.parentPath, newOrder);
        this.refresh();
    }

    async moveItemDown(item: FileItem): Promise<void> {
        if (!item.parentPath) return;
        
        const siblings = await this.getChildren(new FileItem('', item.parentPath, vscode.TreeItemCollapsibleState.Expanded, true));
        const currentIndex = siblings.findIndex(sibling => sibling.fileName === item.fileName);
        
        if (currentIndex === -1 || currentIndex >= siblings.length - 1) return;
        
        // Swap with next item
        const newOrder = siblings.map(s => s.fileName);
        [newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]];
        
        await this.configManager.setOrderForFolder(item.parentPath, newOrder);
        this.refresh();
    }

    async setCustomOrderForFolder(folderItem: FileItem): Promise<void> {
        if (!folderItem.isDirectory) return;
        
        const children = await this.getChildren(folderItem);
        const currentOrder = children.map(child => child.fileName);
        
        const result = await vscode.window.showQuickPick(
            [
                { label: 'Interactive Reordering', description: 'Use move up/down commands' },
                { label: 'Manual Entry', description: 'Enter comma-separated list' },
                { label: 'Reset to Default', description: 'Remove custom ordering' }
            ],
            {
                placeHolder: 'How would you like to set the custom order?'
            }
        );

        if (!result) return;

        switch (result.label) {
            case 'Manual Entry':
                const orderInput = await vscode.window.showInputBox({
                    prompt: 'Enter file/folder names in desired order (comma-separated)',
                    value: currentOrder.join(', '),
                    placeHolder: 'App.jsx, components, hooks, pages'
                });

                if (orderInput) {
                    const newOrder = orderInput.split(',').map(s => s.trim()).filter(s => s);
                    await this.configManager.setOrderForFolder(folderItem.filePath, newOrder);
                    this.refresh();
                }
                break;

            case 'Reset to Default':
                await this.configManager.resetOrderForFolder(folderItem.filePath);
                this.refresh();
                break;

            case 'Interactive Reordering':
                vscode.window.showInformationMessage('Use right-click "Move Up" or "Move Down" commands to reorder items.');
                break;
        }
    }
}