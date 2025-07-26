import * as vscode from 'vscode';
import { CustomFileOrderProvider } from './treeProvider';
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
    
    // Register tree data provider
    const treeView = vscode.window.createTreeView('customFileOrder', {
        treeDataProvider: provider,
        showCollapseAll: true
    });
    
    provider.setTreeView(treeView);

    // Register existing commands
    const refreshCommand = vscode.commands.registerCommand('customFileOrder.refresh', () => {
        provider.refresh();
    });

    const openFileCommand = vscode.commands.registerCommand('customFileOrder.openFile', (resource: vscode.Uri) => {
        vscode.window.showTextDocument(resource);
    });

    const revealInExplorerCommand = vscode.commands.registerCommand('customFileOrder.revealInExplorer', (item) => {
        if (item && item.resourceUri) {
            vscode.commands.executeCommand('revealFileInOS', item.resourceUri);
        }
    });

    // Register new commands
    const moveUpCommand = vscode.commands.registerCommand('customFileOrder.moveUp', (item) => {
        provider.moveItemUp(item);
    });

    const moveDownCommand = vscode.commands.registerCommand('customFileOrder.moveDown', (item) => {
        provider.moveItemDown(item);
    });

    const setCustomOrderCommand = vscode.commands.registerCommand('customFileOrder.setCustomOrder', (item) => {
        provider.setCustomOrderForFolder(item);
    });

    const resetOrderCommand = vscode.commands.registerCommand('customFileOrder.resetOrder', async (item) => {
        const configManager = ConfigManager.getInstance();
        await configManager.resetOrderForFolder(item.filePath);
        provider.refresh();
    });

    const openConfigCommand = vscode.commands.registerCommand('customFileOrder.openConfig', () => {
        ConfigurationPanel.createOrShow(context.extensionUri);
    });

    // Watch for configuration changes
    const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
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
        configWatcher,
        fileWatcher
    );
}

export function deactivate() {}