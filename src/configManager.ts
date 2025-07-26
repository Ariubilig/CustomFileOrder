import * as vscode from 'vscode';
import { OrderConfiguration, OrderRule } from './models/orderRule';

export class ConfigManager {
    private static instance: ConfigManager;
    private configuration: vscode.WorkspaceConfiguration;

    private constructor() {
        this.configuration = vscode.workspace.getConfiguration('customFileOrder');
    }

    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    public getOrderRules(): OrderConfiguration {
        return this.configuration.get<OrderConfiguration>('rules', {});
    }

    public getOrderForFolder(folderPath: string): string[] {
        const rules = this.getOrderRules();
        
        // Check for exact match first
        if (rules[folderPath]) {
            return rules[folderPath].order;
        }

        // Check for relative path matches (like 'src' matching any src folder)
        const folderName = folderPath.split(/[\/\\]/).pop() || '';
        for (const rulePath in rules) {
            if (rulePath === folderName || folderPath.endsWith(rulePath)) {
                return rules[rulePath].order;
            }
        }

        return [];
    }

    public async setOrderForFolder(folderPath: string, order: string[]): Promise<void> {
        const rules = this.getOrderRules();
        
        // Use relative path if it's a common folder name
        const folderName = folderPath.split(/[\/\\]/).pop() || folderPath;
        const keyToUse = ['src', 'components', 'pages', 'hooks', 'utils', 'assets'].includes(folderName) 
            ? folderName 
            : folderPath;
            
        rules[keyToUse] = {
            order,
            type: 'manual'
        };

        await this.configuration.update('rules', rules, vscode.ConfigurationTarget.Workspace);
    }

    public async resetOrderForFolder(folderPath: string): Promise<void> {
        const rules = this.getOrderRules();
        const folderName = folderPath.split(/[\/\\]/).pop() || folderPath;
        
        // Try both full path and folder name
        delete rules[folderPath];
        delete rules[folderName];

        await this.configuration.update('rules', rules, vscode.ConfigurationTarget.Workspace);
    }

    public refresh(): void {
        this.configuration = vscode.workspace.getConfiguration('customFileOrder');
    }

    // Get all configured folders for the settings UI
    public getConfiguredFolders(): string[] {
        const rules = this.getOrderRules();
        return Object.keys(rules);
    }
}