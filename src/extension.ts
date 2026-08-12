import * as vscode from 'vscode';
import { CustomFileOrderProvider } from './treeProvider';
import { ConfigManager } from './configManager';

/** Collapses bursts of file system events into a single tree refresh. */
const REFRESH_DEBOUNCE_MS = 300;

export function activate(context: vscode.ExtensionContext) {
    // Get workspace root
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        return;
    }

    const configManager = ConfigManager.getInstance();
    configManager.setWorkspaceRoot(workspaceRoot);

    // Create tree data provider
    const provider = new CustomFileOrderProvider(workspaceRoot);

    // Register tree data provider
    const treeView = vscode.window.createTreeView('customFileOrder', {
        treeDataProvider: provider,
        showCollapseAll: true,
        canSelectMany: true
    });

    /** The items a command should act on: the clicked item, or the selection. */
    const targets = (item?: any): any[] => {
        if (treeView.selection.length > 1) {
            return [...treeView.selection];
        }
        return item ? [item] : [...treeView.selection];
    };

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

    const resetOrderCommand = vscode.commands.registerCommand('customFileOrder.resetOrder', async (item: any) => {
        // Always use parentPath to reset the list containing the item.
        // If item is undefined (command palette), default to workspace root.
        const targetPath = item ? (item.parentPath || workspaceRoot) : workspaceRoot;

        await configManager.resetOrderForFolder(targetPath);
        provider.refresh();
    });

    const restoreItemCommand = vscode.commands.registerCommand('customFileOrder.restoreItem', async (item: any) => {
        if (!item) {
            return;
        }
        await provider.restoreItemPosition(item);
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
        await provider.deleteItems(targets(item));
    });
    const duplicateCommand = vscode.commands.registerCommand('customFileOrder.duplicate', async (item?: any) => {
        await provider.duplicateItems(targets(item));
    });
    const copyCommand = vscode.commands.registerCommand('customFileOrder.copy', (item?: any) => {
        provider.copyItems(targets(item));
    });
    const cutCommand = vscode.commands.registerCommand('customFileOrder.cut', (item?: any) => {
        provider.cutItems(targets(item));
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

    // Watch for file system changes. Content edits are ignored because they
    // cannot change the tree, and bursts are debounced into one refresh.
    let refreshTimer: NodeJS.Timeout | undefined;
    const scheduleRefresh = () => {
        if (!configManager.getAutoRefreshEnabled()) {
            return;
        }
        if (refreshTimer) {
            clearTimeout(refreshTimer);
        }
        refreshTimer = setTimeout(() => {
            refreshTimer = undefined;
            provider.refresh();
        }, REFRESH_DEBOUNCE_MS);
    };

    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*', false, true, false);
    fileWatcher.onDidCreate(scheduleRefresh);
    fileWatcher.onDidDelete(scheduleRefresh);

    const pendingRefresh = new vscode.Disposable(() => {
        if (refreshTimer) {
            clearTimeout(refreshTimer);
        }
    });

    // Add to subscriptions
    context.subscriptions.push(
        treeView,
        refreshCommand,
        openFileCommand,
        revealInExplorerCommand,
        moveUpCommand,
        moveDownCommand,
        resetOrderCommand,
        restoreItemCommand,
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
        fileWatcher,
        pendingRefresh
    );

    // Rules written by older versions were keyed by absolute path, which only
    // ever matched on the machine they were created on.
    void configManager.migrateLegacyRules().then(changed => {
        if (changed) {
            provider.refresh();
        }
    });
}

export function deactivate() {}
