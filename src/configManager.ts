import * as vscode from 'vscode';
import { OrderConfiguration, OrderRule, PatternRule, PROJECT_TEMPLATES, ProjectTemplate } from './models/orderRule';
import * as path from 'path';

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
        const rules = this.getOrderRules();
        
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

    public async applyTemplate(template: ProjectTemplate): Promise<void> {
        const rules = this.getOrderRules();
        
        // Merge template rules with existing rules
        for (const [folderPath, templateRule] of Object.entries(template.rules)) {
            rules[folderPath] = {
                order: templateRule.order,
                type: templateRule.patterns ? 'pattern' : 'template',
                ...(templateRule.patterns && { patterns: templateRule.patterns }),
                template: template.name
            };
        }

        await this.configuration.update('rules', rules, vscode.ConfigurationTarget.Workspace);
    }

    public getAvailableTemplates(): ProjectTemplate[] {
        return PROJECT_TEMPLATES;
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