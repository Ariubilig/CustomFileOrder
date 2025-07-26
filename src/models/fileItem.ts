import * as vscode from 'vscode';
import * as path from 'path';

export class FileItem extends vscode.TreeItem {
    public position: number = 0;
    
    constructor(
        public readonly label: string,
        public readonly filePath: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly isDirectory: boolean,
        public readonly parentPath?: string
    ) {
        super(label, collapsibleState);
        
        this.tooltip = this.filePath;
        this.resourceUri = vscode.Uri.file(this.filePath);
        
        if (isDirectory) {
            this.contextValue = 'folder';
            this.iconPath = vscode.ThemeIcon.Folder;
        } else {
            this.contextValue = 'file';
            this.iconPath = vscode.ThemeIcon.File;
            this.command = {
                command: 'customFileOrder.openFile',
                title: 'Open File',
                arguments: [this.resourceUri]
            };
        }
    }

    get fileName(): string {
        return path.basename(this.filePath);
    }

    get folderPath(): string {
        return path.dirname(this.filePath);
    }

    // Add visual indicator for custom ordered folders
    updateContextValue(hasCustomOrder: boolean): void {
        if (this.isDirectory && hasCustomOrder) {
            this.contextValue = 'folder-custom';
            this.description = '(custom order)';
        }
    }
}