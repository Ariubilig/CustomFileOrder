import * as vscode from 'vscode';
import { CustomFileOrderProvider, FileTreeDragAndDropController } from './treeProvider';
import { ConfigManager } from './configManager';
import { ConfigurationPanel } from './configurationPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('Custom File Order extension is now active!');

    // Get workspace root
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        return;
    }

    // Create tree data provider
    const provider = new CustomFileOrderProvider(workspaceRoot);
    const dnd = new FileTreeDragAndDropController(provider);
    
    // Register tree data provider
    const treeView = vscode.window.createTreeView('customFileOrder', {
        treeDataProvider: provider,
        showCollapseAll: true,
        canSelectMany: true,
        dragAndDropController: dnd
    });
    
    provider.setTreeView(treeView);

    // Register existing commands
    const refreshCommand = vscode.commands.registerCommand('customFileOrder.refresh', () => {
        provider.refresh();
    });

    const openFileCommand = vscode.commands.registerCommand('customFileOrder.openFile', (resource: vscode.Uri) => {
        vscode.window.showTextDocument(resource);
    });

    const revealInExplorerCommand = vscode.commands.registerCommand('customFileOrder.revealInExplorer', (item: any) => {
        if (item && item.resourceUri) {
            vscode.commands.executeCommand('revealFileInOS', item.resourceUri);
        }
    });

    // Register new commands
    const moveUpCommand = vscode.commands.registerCommand('customFileOrder.moveUp', (item: any) => {
        provider.moveItemUp(item);
    });

    const moveDownCommand = vscode.commands.registerCommand('customFileOrder.moveDown', (item: any) => {
        provider.moveItemDown(item);
    });

    const setCustomOrderCommand = vscode.commands.registerCommand('customFileOrder.setCustomOrder', (item: any) => {
        provider.setCustomOrderForFolder(item);
    });

    const resetOrderCommand = vscode.commands.registerCommand('customFileOrder.resetOrder', async (item: any) => {
        const configManager = ConfigManager.getInstance();
        await configManager.resetOrderForFolder(item.filePath);
        provider.refresh();
    });

    const openConfigCommand = vscode.commands.registerCommand('customFileOrder.openConfig', () => {
        ConfigurationPanel.createOrShow(context.extensionUri);
    });

    // File operation commands
    const newFileCommand = vscode.commands.registerCommand('customFileOrder.newFile', (item?: any) => {
        provider.createFile(item);
    });
    const newFolderCommand = vscode.commands.registerCommand('customFileOrder.newFolder', (item?: any) => {
        provider.createFolder(item);
    });
    const renameCommand = vscode.commands.registerCommand('customFileOrder.rename', async (item?: any) => {
        const target = item ?? treeView.selection[0];
        if (target) {
            await provider.renameItem(target);
        }
    });
    const deleteCommand = vscode.commands.registerCommand('customFileOrder.delete', async (item?: any) => {
        const selection = treeView.selection && treeView.selection.length > 1 ? treeView.selection : (item ? [item] : []);
        await provider.deleteItems(selection as readonly any[]);
    });
    const duplicateCommand = vscode.commands.registerCommand('customFileOrder.duplicate', async (item?: any) => {
        const selection = treeView.selection && treeView.selection.length > 1 ? treeView.selection : (item ? [item] : []);
        await provider.duplicateItems(selection as readonly any[]);
    });
    const copyCommand = vscode.commands.registerCommand('customFileOrder.copy', (item?: any) => {
        const selection = treeView.selection && treeView.selection.length > 1 ? treeView.selection : (item ? [item] : []);
        provider.copyItems(selection as readonly any[]);
    });
    const cutCommand = vscode.commands.registerCommand('customFileOrder.cut', (item?: any) => {
        const selection = treeView.selection && treeView.selection.length > 1 ? treeView.selection : (item ? [item] : []);
        provider.cutItems(selection as readonly any[]);
    });
    const pasteCommand = vscode.commands.registerCommand('customFileOrder.paste', async (item?: any) => {
        await provider.pasteInto(item);
    });
    const copyPathCommand = vscode.commands.registerCommand('customFileOrder.copyPath', async (item?: any) => {
        const target = item ?? treeView.selection[0];
        if (target) {
            await provider.copyPath(target);
        }
    });

    // Watch for configuration changes
    const configWatcher = vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
        if (e.affectsConfiguration('customFileOrder')) {
            provider.refresh();
        }
    });

    // Watch for file system changes
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    fileWatcher.onDidCreate(() => provider.refresh());
    fileWatcher.onDidDelete(() => provider.refresh());
    fileWatcher.onDidChange(() => provider.refresh());

    // Add to subscriptions
    context.subscriptions.push(
        refreshCommand,
        openFileCommand,
        revealInExplorerCommand,
        moveUpCommand,
        moveDownCommand,
        setCustomOrderCommand,
        resetOrderCommand,
        openConfigCommand,
        newFileCommand,
        newFolderCommand,
        renameCommand,
        deleteCommand,
        duplicateCommand,
        copyCommand,
        cutCommand,
        pasteCommand,
        copyPathCommand,
        configWatcher,
        fileWatcher
    );
}

export function deactivate() {}