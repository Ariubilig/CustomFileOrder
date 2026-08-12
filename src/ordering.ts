import * as path from 'path';

/**
 * Pure ordering logic, deliberately free of any `vscode` import so it can be
 * unit tested on its own.
 */

/** Rule key used for the workspace root itself. */
export const ROOT_KEY = '.';

export interface SortableEntry {
    name: string;
    isDirectory: boolean;
}

/** A single folder's stored ordering rule. */
export interface StoredRule {
    order: string[];
}

/** The shape of the `customFileOrder.rules` setting. */
export interface RuleMap {
    [folderKey: string]: StoredRule;
}

export interface MigrationResult {
    rules: RuleMap;
    changed: boolean;
}

export function toPosix(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

/** True for keys written by older versions, which stored full paths. */
export function isAbsoluteKey(key: string): boolean {
    return path.isAbsolute(key) || /^[a-zA-Z]:[\\/]/.test(key) || key.startsWith('\\\\');
}

/**
 * Key a folder by its workspace-relative POSIX path, so a rule survives moving
 * the project to another directory or machine and two folders sharing a name
 * (`src/models` vs `test/models`) never collide. Folders outside the workspace
 * fall back to their absolute path.
 */
export function keyForFolder(workspaceRoot: string, folderPath: string): string {
    if (!workspaceRoot) {
        return toPosix(folderPath);
    }

    const relative = path.relative(workspaceRoot, folderPath);
    if (relative === '') {
        return ROOT_KEY;
    }
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return toPosix(folderPath);
    }
    return toPosix(relative);
}

/** Case-insensitive and digit-aware, so `file2` sorts before `file10`. */
export function compareNames(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function compareEntries(a: SortableEntry, b: SortableEntry, foldersFirst: boolean): number {
    if (foldersFirst && a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
    }
    return compareNames(a.name, b.name);
}

export function isPattern(name: string): boolean {
    return name.includes('*') || name.includes('?');
}

export function matchesPattern(name: string, pattern: string): boolean {
    const regex = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(name);
}

/**
 * Arrange entries by an ordering rule: named entries first in the order given,
 * then everything the rule does not mention, sorted the default way.
 */
export function applyOrder<T extends SortableEntry>(
    entries: readonly T[],
    order: readonly string[],
    foldersFirst: boolean
): T[] {
    const remaining = [...entries];
    const sortRemaining = () => remaining.sort((a, b) => compareEntries(a, b, foldersFirst));

    if (order.length === 0) {
        return sortRemaining();
    }

    const ordered: T[] = [];
    for (const name of order) {
        if (isPattern(name)) {
            // A glob claims every entry it matches, sorted among themselves.
            const matched = remaining
                .filter(entry => matchesPattern(entry.name, name))
                .sort((a, b) => compareEntries(a, b, foldersFirst));
            for (const entry of matched) {
                remaining.splice(remaining.indexOf(entry), 1);
                ordered.push(entry);
            }
            continue;
        }

        const index = remaining.findIndex(entry => entry.name === name);
        if (index !== -1) {
            ordered.push(remaining.splice(index, 1)[0]);
        }
    }

    return [...ordered, ...sortRemaining()];
}

/**
 * Move a single entry back to where default sorting would have put it, leaving
 * the rest of the custom order untouched.
 */
export function restoreToDefaultPosition(
    order: readonly string[],
    item: SortableEntry,
    isDirectory: (name: string) => boolean,
    foldersFirst: boolean
): string[] {
    const result = order.filter(name => name !== item.name);
    const insertAt = result.findIndex(
        name => compareEntries(item, { name, isDirectory: isDirectory(name) }, foldersFirst) < 0
    );

    result.splice(insertAt === -1 ? result.length : insertAt, 0, item.name);
    return result;
}

/**
 * Bring rules written by older versions up to date: absolute-path keys become
 * workspace-relative, the obsolete `type`/`patterns` fields are dropped, and
 * malformed or unreachable entries are discarded.
 */
export function migrateRules(raw: unknown, workspaceRoot: string): MigrationResult {
    const source: Record<string, unknown> =
        raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const rules: RuleMap = {};

    for (const key of Object.keys(source)) {
        const rule = source[key] as { order?: unknown } | null;
        if (!rule || typeof rule !== 'object' || !Array.isArray(rule.order)) {
            continue;
        }

        const order = rule.order.filter((name: unknown): name is string => typeof name === 'string');
        if (order.length === 0) {
            continue;
        }

        let migratedKey = key;
        if (isAbsoluteKey(key)) {
            migratedKey = keyForFolder(workspaceRoot, key);
            // Still absolute means the folder sits outside this workspace, so
            // the rule can never apply to anything the tree shows.
            if (isAbsoluteKey(migratedKey)) {
                continue;
            }
        }

        // The first rule for a folder wins if a legacy key collides with a new one.
        if (!rules[migratedKey]) {
            rules[migratedKey] = { order };
        }
    }

    return { rules, changed: !isSameRuleMap(source, rules) };
}

function isSameRuleMap(source: Record<string, unknown>, migrated: RuleMap): boolean {
    const sourceKeys = Object.keys(source);
    if (sourceKeys.length !== Object.keys(migrated).length) {
        return false;
    }

    return sourceKeys.every(key => {
        const original = source[key] as { order?: unknown } | null;
        const result = migrated[key];
        return (
            !!result &&
            !!original &&
            // A leftover `type` or `patterns` field means it still needs rewriting.
            Object.keys(original).length === 1 &&
            Array.isArray(original.order) &&
            original.order.length === result.order.length &&
            original.order.every((name: unknown, index: number) => name === result.order[index])
        );
    });
}
