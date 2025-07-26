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

        try {
            const items: FileItem[] = [];
            const entries = fs.readdirSync(folderPath, { withFileTypes: true });

            // Filter out hidden files and system files unless explicitly shown
            const filteredEntries = entries.filter(entry => {
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
            filteredEntries.forEach(entry => {
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
            console.error(`Error reading directory ${folderPath}:`, error);
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
        customOrder.forEach(orderName => {
            const index = remainingItems.findIndex(item => {
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
        const sortedRemaining = remainingItems.sort((a, b) => {
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
            const currentIndex = siblings.findIndex(sibling => sibling.fileName === item.fileName);
            
            if (currentIndex <= 0) {
                vscode.window.showInformationMessage('Item is already at the top');
                return;
            }
            
            // Create new order array
            const newOrder = siblings.map(s => s.fileName);
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
            const currentIndex = siblings.findIndex(sibling => sibling.fileName === item.fileName);
            
            if (currentIndex === -1 || currentIndex >= siblings.length - 1) {
                vscode.window.showInformationMessage('Item is already at the bottom');
                return;
            }
            
            // Create new order array
            const newOrder = siblings.map(s => s.fileName);
            [newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]];
            
            await this.configManager.setOrderForFolder(item.parentPath, newOrder);
            this.refresh();
            
            vscode.window.showInformationMessage(`Moved "${item.fileName}" down`);
        } catch (error) {
            vscode.window.showErrorMessage(`Error moving item: ${error}`);
        }
    }

    async setCustomOrderForFolder(folderItem: FileItem): Promise<void> {
        if (!folderItem.isDirectory) {
            vscode.window.showWarningMessage('Can only set custom order for folders');
            return;
        }
        
        try {
            const children = await this.getChildren(folderItem);
            const currentOrder = children.map(child => child.fileName);
            
            const result = await vscode.window.showQuickPick(
                [
                    { 
                        label: '$(list-ordered) Interactive Reordering', 
                        description: 'Use move up/down commands to reorder items',
                        action: 'interactive'
                    },
                    { 
                        label: '$(edit) Manual Entry', 
                        description: 'Enter comma-separated list of file/folder names',
                        action: 'manual'
                    },
                    { 
                        label: '$(template) Apply Template', 
                        description: 'Apply a predefined ordering template',
                        action: 'template'
                    },
                    { 
                        label: '$(trash) Reset to Default', 
                        description: 'Remove custom ordering and use default sort',
                        action: 'reset'
                    }
                ],
                {
                    placeHolder: 'How would you like to set the custom order?',
                    ignoreFocusOut: true
                }
            );

            if (!result) return;

            switch (result.action) {
                case 'manual':
                    await this.handleManualEntry(folderItem, currentOrder);
                    break;

                case 'template':
                    await this.handleTemplateApplication(folderItem);
                    break;

                case 'reset':
                    await this.handleResetOrder(folderItem);
                    break;

                case 'interactive':
                    vscode.window.showInformationMessage(
                        'Use right-click "Move Up" or "Move Down" commands to reorder items, or open the Configuration Panel for drag & drop.',
                        'Open Config Panel'
                    ).then(selection => {
                        if (selection === 'Open Config Panel') {
                            vscode.commands.executeCommand('customFileOrder.openConfig');
                        }
                    });
                    break;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error setting custom order: ${error}`);
        }
    }

    private async handleManualEntry(folderItem: FileItem, currentOrder: string[]): Promise<void> {
        const orderInput = await vscode.window.showInputBox({
            prompt: 'Enter file/folder names in desired order (comma-separated)',
            value: currentOrder.join(', '),
            placeHolder: 'App.jsx, components, hooks, pages',
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value.trim()) {
                    return 'Please enter at least one item';
                }
                return null;
            }
        });

        if (orderInput) {
            const newOrder = orderInput.split(',').map(s => s.trim()).filter(s => s);
            await this.configManager.setOrderForFolder(folderItem.filePath, newOrder);
            this.refresh();
            vscode.window.showInformationMessage(`Custom order set for "${folderItem.fileName}"`);
        }
    }

    private async handleTemplateApplication(folderItem: FileItem): Promise<void> {
        const templates = this.configManager.getAvailableTemplates();
        const templateItems = templates.map(template => ({
            label: `$(file-directory) ${template.name}`,
            description: template.description,
            template: template
        }));

        const selectedTemplate = await vscode.window.showQuickPick(templateItems, {
            placeHolder: 'Select a template to apply',
            ignoreFocusOut: true
        });

        if (selectedTemplate) {
            const folderName = path.basename(folderItem.filePath);
            const templateRule = selectedTemplate.template.rules[folderName] || 
                                selectedTemplate.template.rules['.'] ||
                                Object.values(selectedTemplate.template.rules)[0];

            if (templateRule) {
                await this.configManager.setOrderForFolder(folderItem.filePath, templateRule.order);
                this.refresh();
                vscode.window.showInformationMessage(`Applied template "${selectedTemplate.template.name}" to "${folderItem.fileName}"`);
            } else {
                vscode.window.showWarningMessage(`No rule found for folder "${folderName}" in template "${selectedTemplate.template.name}"`);
            }
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
    async applyProjectTemplate(): Promise<void> {
        try {
            const templates = this.configManager.getAvailableTemplates();
            const templateItems = templates.map(template => ({
                label: `$(file-directory) ${template.name}`,
                description: template.description,
                template: template
            }));

            const selected = await vscode.window.showQuickPick(templateItems, {
                placeHolder: 'Select a project template to apply',
                ignoreFocusOut: true
            });

            if (selected) {
                const confirmation = await vscode.window.showWarningMessage(
                    `Apply template "${selected.template.name}"? This will override existing custom orders.`,
                    { modal: true },
                    'Apply Template'
                );

                if (confirmation === 'Apply Template') {
                    await this.configManager.applyTemplate(selected.template);
                    this.refresh();
                    vscode.window.showInformationMessage(`Applied template: ${selected.template.name}`);
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error applying template: ${error}`);
        }
    }

    async createCustomTemplate(): Promise<void> {
        try {
            const templateName = await vscode.window.showInputBox({
                prompt: 'Enter template name',
                placeHolder: 'My Custom Template',
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value.trim()) {
                        return 'Template name is required';
                    }
                    if (value.length < 2) {
                        return 'Template name must be at least 2 characters';
                    }
                    return null;
                }
            });

            if (!templateName) return;

            const templateDescription = await vscode.window.showInputBox({
                prompt: 'Enter template description',
                placeHolder: 'Description of what this template does',
                ignoreFocusOut: true
            });

            if (!templateDescription) return;

            // Get current rules as base for template
            const currentRules = this.configManager.getOrderRules();
            
            if (Object.keys(currentRules).length === 0) {
                vscode.window.showWarningMessage('No custom rules found to create template from. Create some custom orders first.');
                return;
            }

            // Convert current rules to template format
            const templateRules: any = {};
            for (const [folderPath, rule] of Object.entries(currentRules)) {
                templateRules[folderPath] = {
                    order: rule.order,
                    ...(rule.patterns && { patterns: rule.patterns })
                };
            }

            // Save template to workspace settings
            const config = vscode.workspace.getConfiguration('customFileOrder');
            const templates = config.get<any[]>('customTemplates', []);
            
            templates.push({
                name: templateName,
                description: templateDescription,
                rules: templateRules,
                created: new Date().toISOString(),
                author: 'user'
            });

            await config.update('customTemplates', templates, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Template "${templateName}" created successfully!`);
        } catch (error) {
            vscode.window.showErrorMessage(`Error creating template: ${error}`);
        }
    }

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
    getTreeStatistics(): { totalItems: number; customRules: number; templatedFolders: number } {
        const rules = this.configManager.getOrderRules();
        const totalItems = this.countItemsRecursively(this.workspaceRoot);
        const customRules = Object.keys(rules).length;
        const templatedFolders = Object.values(rules).filter(rule => rule.type === 'template').length;

        return {
            totalItems,
            customRules,
            templatedFolders
        };
    }

    private countItemsRecursively(folderPath: string, depth: number = 0): number {
        if (depth > 3 || !fs.existsSync(folderPath)) return 0; // Limit recursion depth
        
        try {
            const entries = fs.readdirSync(folderPath, { withFileTypes: true });
            let count = entries.length;
            
            entries.forEach(entry => {
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    count += this.countItemsRecursively(path.join(folderPath, entry.name), depth + 1);
                }
            });
            
            return count;
        } catch {
            return 0;
        }
    }
}