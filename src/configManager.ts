import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { OrderConfiguration, OrderRule, PatternRule } from './models/orderRule';

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
            return this.processOrderWithPatterns(rules[folderPath], folderPath);
        }

        // Check for relative path matches (like 'src' matching any src folder)
        const folderName = folderPath.split(/[\/\\]/).pop() || '';
        for (const rulePath in rules) {
            if (rulePath === folderName || folderPath.endsWith(rulePath)) {
                return this.processOrderWithPatterns(rules[rulePath], folderPath);
            }
        }

        return [];
    }

    private processOrderWithPatterns(rule: OrderConfiguration[string], folderPath: string): string[] {
        if (rule.type === 'pattern' && rule.patterns) {
            return this.generateOrderFromPatterns(rule.patterns, folderPath);
        }
        return rule.order;
    }

    private generateOrderFromPatterns(patterns: PatternRule[], folderPath: string): string[] {
        // This would scan the actual folder and apply patterns
        // For now, return the basic order
        return [];
    }

    public async setOrderForFolder(folderPath: string, order: string[], type: 'manual' | 'pattern' = 'manual', patterns?: PatternRule[]): Promise<void> {
        const rules = JSON.parse(JSON.stringify(this.getOrderRules()));
        
        // Use relative path if it's a common folder name
        const folderName = folderPath.split(/[\/\\]/).pop() || folderPath;
        const keyToUse = ['src', 'components', 'pages', 'hooks', 'utils', 'assets', 'views', 'router', 'store'].includes(folderName) 
            ? folderName 
            : folderPath;
            
        rules[keyToUse] = {
            order,
            type,
            ...(patterns && { patterns })
        };

        await this.configuration.update('rules', rules, vscode.ConfigurationTarget.Workspace);
    }

    public async resetOrderForFolder(folderPath: string): Promise<void> {
        // Clone the rules object to avoid modifying the read-only proxy
        const rules = JSON.parse(JSON.stringify(this.getOrderRules()));
        
        const folderName = folderPath.split(/[\/\\]/).pop() || folderPath;
        const normalizedPath = folderPath.replace(/\\/g, '/');
        
        // Try all possible key variations
        delete rules[folderPath];
        delete rules[folderName];
        delete rules[normalizedPath];

        await this.configuration.update('rules', rules, vscode.ConfigurationTarget.Workspace);
    }

    public async restoreItemToDefault(folderPath: string, itemName: string): Promise<void> {
        const rules = JSON.parse(JSON.stringify(this.getOrderRules()));
        
        // Find the matching rule key
        const folderName = folderPath.split(/[\/\\]/).pop() || folderPath;
        const normalizedPath = folderPath.replace(/\\/g, '/');
        
        const key = rules[folderPath] ? folderPath :
                   rules[folderName] ? folderName :
                   rules[normalizedPath] ? normalizedPath : null;

        if (key && rules[key]) {
            const currentOrder = rules[key].order as string[];
            const defaultFoldersFirst = this.getDefaultFoldersFirst();
            
            // Remove the item first
            const filteredOrder = currentOrder.filter((name: string) => name !== itemName);
            
            // Determine if the restored item is a directory
            const itemPath = path.join(folderPath, itemName);
            let itemIsDirectory = false;
            try {
                itemIsDirectory = fs.statSync(itemPath).isDirectory();
            } catch (e) {
                // If checking fails (e.g. file deleted), assume file
            }

            // Find insertion index
            let insertIndex = filteredOrder.length;
            
            for (let i = 0; i < filteredOrder.length; i++) {
                const compareName = filteredOrder[i];
                let compareIsDirectory = false;
                
                // Check type of comparison item
                try {
                    const comparePath = path.join(folderPath, compareName);
                    // Use cached knowledge if possible, or check fs
                    compareIsDirectory = fs.statSync(comparePath).isDirectory();
                } catch (e) {
                    // ignore
                }

                // Sorting Logic
                let placeBefore = false;

                if (defaultFoldersFirst) {
                    if (itemIsDirectory && !compareIsDirectory) {
                        // Item is folder, compare is file -> Item comes first
                        placeBefore = true;
                    } else if (!itemIsDirectory && compareIsDirectory) {
                        // Item is file, compare is folder -> Item comes later
                        placeBefore = false;
                    } else {
                        // Same type -> Alphabetical
                        placeBefore = itemName.toLowerCase() < compareName.toLowerCase();
                    }
                } else {
                    // correct alphabetical
                    placeBefore = itemName.toLowerCase() < compareName.toLowerCase();
                }

                if (placeBefore) {
                    insertIndex = i;
                    break;
                }
            }
            
            // Insert item back at correct position
            filteredOrder.splice(insertIndex, 0, itemName);
            rules[key].order = filteredOrder;

            await this.configuration.update('rules', rules, vscode.ConfigurationTarget.Workspace);
        }
    }

    public refresh(): void {
        this.configuration = vscode.workspace.getConfiguration('customFileOrder');
    }

    public getConfiguredFolders(): string[] {
        const rules = this.getOrderRules();
        return Object.keys(rules);
    }

    // Get settings
    public getAutoRefreshEnabled(): boolean {
        return this.configuration.get<boolean>('enableAutoRefresh', true);
    }

    public getShowCustomOrderIndicator(): boolean {
        return this.configuration.get<boolean>('showCustomOrderIndicator', true);
    }

    public getDefaultFoldersFirst(): boolean {
        return this.configuration.get<boolean>('defaultFoldersFirst', true);
    }
}