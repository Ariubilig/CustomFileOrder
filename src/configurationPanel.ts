import * as vscode from 'vscode';
import { ConfigManager } from './configManager';

export class ConfigurationPanel {
    private static currentPanel: ConfigurationPanel | undefined;
    private static readonly viewType = 'customFileOrderConfig';

    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private configManager: ConfigManager;

    public static createOrShow(extensionUri: vscode.Uri): void {
        const column = vscode.ViewColumn.One;

        if (ConfigurationPanel.currentPanel) {
            ConfigurationPanel.currentPanel.panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            ConfigurationPanel.viewType,
            'Custom File Order Configuration',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        ConfigurationPanel.currentPanel = new ConfigurationPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.configManager = ConfigManager.getInstance();

        this.update();
        this.panel.onDidDispose(() => this.dispose(), null);

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'saveOrder':
                        this.saveOrder(message.folderPath, message.order);
                        break;
                    case 'deleteRule':
                        this.deleteRule(message.folderPath);
                        break;
                    case 'addRule':
                        this.addRule(message.folderPath, message.order);
                        break;
                }
            }
        );
    }

    public dispose(): void {
        ConfigurationPanel.currentPanel = undefined;
        this.panel.dispose();
    }

    private async saveOrder(folderPath: string, order: string[]): Promise<void> {
        await this.configManager.setOrderForFolder(folderPath, order);
        vscode.window.showInformationMessage(`Custom order saved for ${folderPath}`);
        this.update(); // Refresh the webview
    }

    private async deleteRule(folderPath: string): Promise<void> {
        await this.configManager.resetOrderForFolder(folderPath);
        vscode.window.showInformationMessage(`Custom order removed for ${folderPath}`);
        this.update();
    }

    private async addRule(folderPath: string, order: string[]): Promise<void> {
        await this.configManager.setOrderForFolder(folderPath, order);
        vscode.window.showInformationMessage(`New custom order added for ${folderPath}`);
        this.update();
    }

    private update(): void {
        this.panel.webview.html = this.getHtmlForWebview();
    }

    private getHtmlForWebview(): string {
        const rules = this.configManager.getOrderRules();
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Custom File Order Configuration</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
        }
        .rule-item {
            border: 1px solid var(--vscode-panel-border);
            margin: 10px 0;
            padding: 15px;
            border-radius: 4px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
        }
        .folder-path {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 10px;
        }
        .order-list {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            margin: 10px 0;
        }
        .order-item {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            padding: 4px 8px;
            border-radius: 3px;
            cursor: move;
            user-select: none;
        }
        .order-item:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .input-group {
            margin: 10px 0;
        }
        .input-group input {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 6px;
            border-radius: 2px;
            width: 100%;
        }
        .button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 2px;
            cursor: pointer;
            margin: 2px;
        }
        .button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .button.danger {
            background-color: var(--vscode-errorForeground);
        }
        .add-rule {
            border: 1px dashed var(--vscode-panel-border);
            padding: 15px;
            margin: 10px 0;
            border-radius: 4px;
            text-align: center;
        }
        h1, h2 {
            color: var(--vscode-editor-foreground);
        }
    </style>
</head>
<body>
    <h1>Custom File Order Configuration</h1>
    <p>Configure custom ordering rules for your folders. Drag items to reorder them.</p>
    
    <div id="rules-container">
        ${Object.entries(rules).map(([folderPath, rule]) => `
            <div class="rule-item" data-folder="${folderPath}">
                <div class="folder-path">${folderPath}</div>
                <div class="order-list" id="order-${folderPath.replace(/[^a-zA-Z0-9]/g, '_')}">
                    ${rule.order.map(item => `
                        <div class="order-item" draggable="true">${item}</div>
                    `).join('')}
                </div>
                <div class="input-group">
                    <input type="text" placeholder="Add new item..." id="input-${folderPath.replace(/[^a-zA-Z0-9]/g, '_')}">
                    <button class="button" onclick="addItem('${folderPath}')">Add Item</button>
                </div>
                <button class="button" onclick="saveRule('${folderPath}')">Save Order</button>
                <button class="button danger" onclick="deleteRule('${folderPath}')">Delete Rule</button>
            </div>
        `).join('')}
    </div>

    <div class="add-rule">
        <h2>Add New Rule</h2>
        <div class="input-group">
            <input type="text" placeholder="Folder path (e.g., src, components)" id="new-folder-path">
        </div>
        <div class="input-group">
            <input type="text" placeholder="Items (comma-separated)" id="new-folder-items">
        </div>
        <button class="button" onclick="addNewRule()">Add Rule</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Drag and drop functionality
        document.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('order-item')) {
                e.dataTransfer.setData('text/plain', e.target.textContent);
                e.dataTransfer.effectAllowed = 'move';
            }
        });

        document.addEventListener('dragover', (e) => {
            if (e.target.classList.contains('order-item')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            }
        });

        document.addEventListener('drop', (e) => {
            if (e.target.classList.contains('order-item')) {
                e.preventDefault();
                const draggedText = e.dataTransfer.getData('text/plain');
                const targetText = e.target.textContent;
                
                if (draggedText !== targetText) {
                    // Find the container
                    const container = e.target.parentElement;
                    const items = Array.from(container.children);
                    const draggedElement = items.find(item => item.textContent === draggedText);
                    
                    if (draggedElement) {
                        container.insertBefore(draggedElement, e.target);
                    }
                }
            }
        });

        function saveRule(folderPath) {
            const containerId = 'order-' + folderPath.replace(/[^a-zA-Z0-9]/g, '_');
            const container = document.getElementById(containerId);
            const items = Array.from(container.children).map(item => item.textContent);
            
            vscode.postMessage({
                command: 'saveOrder',
                folderPath: folderPath,
                order: items
            });
        }

        function deleteRule(folderPath) {
            vscode.postMessage({
                command: 'deleteRule',
                folderPath: folderPath
            });
        }

        function addItem(folderPath) {
            const inputId = 'input-' + folderPath.replace(/[^a-zA-Z0-9]/g, '_');
            const input = document.getElementById(inputId);
            const containerId = 'order-' + folderPath.replace(/[^a-zA-Z0-9]/g, '_');
            const container = document.getElementById(containerId);
            
            if (input.value.trim()) {
                const newItem = document.createElement('div');
                newItem.className = 'order-item';
                newItem.draggable = true;
                newItem.textContent = input.value.trim();
                container.appendChild(newItem);
                input.value = '';
            }
        }

        function addNewRule() {
            const folderPath = document.getElementById('new-folder-path').value.trim();
            const items = document.getElementById('new-folder-items').value.trim();
            
            if (folderPath && items) {
                const order = items.split(',').map(s => s.trim()).filter(s => s);
                vscode.postMessage({
                    command: 'addRule',
                    folderPath: folderPath,
                    order: order
                });
                
                document.getElementById('new-folder-path').value = '';
                document.getElementById('new-folder-items').value = '';
            }
        }
    </script>
</body>
</html>`;
    }
}