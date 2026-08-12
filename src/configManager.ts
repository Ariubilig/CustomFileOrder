import * as vscode from 'vscode';
import { keyForFolder, migrateRules, RuleMap } from './ordering';

export class ConfigManager {
    private static instance: ConfigManager;
    private configuration: vscode.WorkspaceConfiguration;
    private workspaceRoot: string = '';

    private constructor() {
        this.configuration = vscode.workspace.getConfiguration('customFileOrder');
    }

    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    public setWorkspaceRoot(workspaceRoot: string): void {
        this.workspaceRoot = workspaceRoot;
    }

    public getOrderRules(): RuleMap {
        return this.configuration.get<RuleMap>('rules', {});
    }

    public getOrderForFolder(folderPath: string): string[] {
        const rule = this.getOrderRules()[this.keyFor(folderPath)];
        return rule && Array.isArray(rule.order) ? [...rule.order] : [];
    }

    public async setOrderForFolder(folderPath: string, order: string[]): Promise<void> {
        const rules = this.cloneRules();
        rules[this.keyFor(folderPath)] = { order };
        await this.save(rules);
    }

    public async resetOrderForFolder(folderPath: string): Promise<void> {
        const rules = this.cloneRules();
        delete rules[this.keyFor(folderPath)];
        await this.save(rules);
    }

    /**
     * Rewrite rules stored by older versions, which keyed folders by absolute
     * path or bare folder name. Returns true when the setting was rewritten.
     */
    public async migrateLegacyRules(): Promise<boolean> {
        const { rules, changed } = migrateRules(this.getOrderRules(), this.workspaceRoot);
        if (changed) {
            await this.save(rules);
        }
        return changed;
    }

    public refresh(): void {
        this.configuration = vscode.workspace.getConfiguration('customFileOrder');
    }

    public getAutoRefreshEnabled(): boolean {
        return this.configuration.get<boolean>('enableAutoRefresh', true);
    }

    public getShowCustomOrderIndicator(): boolean {
        return this.configuration.get<boolean>('showCustomOrderIndicator', true);
    }

    public getDefaultFoldersFirst(): boolean {
        return this.configuration.get<boolean>('defaultFoldersFirst', true);
    }

    private keyFor(folderPath: string): string {
        return keyForFolder(this.workspaceRoot, folderPath);
    }

    private cloneRules(): RuleMap {
        // getOrderRules() hands back a frozen proxy, so work on a copy.
        return JSON.parse(JSON.stringify(this.getOrderRules()));
    }

    private async save(rules: RuleMap): Promise<void> {
        await this.configuration.update('rules', rules, vscode.ConfigurationTarget.Workspace);
    }
}
