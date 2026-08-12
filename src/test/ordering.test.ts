import * as assert from 'assert';
import * as path from 'path';
import {
    applyOrder,
    compareNames,
    keyForFolder,
    matchesPattern,
    migrateRules,
    moveSelection,
    restoreToDefaultPosition,
    SortableEntry
} from '../ordering';

const file = (name: string): SortableEntry => ({ name, isDirectory: false });
const folder = (name: string): SortableEntry => ({ name, isDirectory: true });
const names = (entries: SortableEntry[]) => entries.map(entry => entry.name);

suite('keyForFolder', () => {
    const root = path.resolve('/ws');

    test('keys the workspace root as "."', () => {
        assert.strictEqual(keyForFolder(root, root), '.');
    });

    test('keys nested folders by relative POSIX path', () => {
        assert.strictEqual(keyForFolder(root, path.join(root, 'src', 'models')), 'src/models');
    });

    test('keeps same-named folders apart', () => {
        assert.notStrictEqual(
            keyForFolder(root, path.join(root, 'src', 'models')),
            keyForFolder(root, path.join(root, 'test', 'models'))
        );
    });

    test('falls back to an absolute key outside the workspace', () => {
        const outside = path.resolve('/elsewhere/src');
        assert.strictEqual(keyForFolder(root, outside), outside.replace(/\\/g, '/'));
    });
});

suite('compareNames', () => {
    test('is case insensitive', () => {
        assert.ok(compareNames('Apple.ts', 'banana.ts') < 0);
    });

    test('is digit aware', () => {
        assert.ok(compareNames('file2.ts', 'file10.ts') < 0);
    });
});

suite('matchesPattern', () => {
    test('matches a star glob', () => {
        assert.ok(matchesPattern('main.css', '*.css'));
        assert.ok(!matchesPattern('main.scss', '*.css'));
    });

    test('treats the dot as a literal', () => {
        assert.ok(!matchesPattern('indexXts', 'index.ts'));
    });
});

suite('applyOrder', () => {
    const entries = [file('zebra.ts'), file('alpha.ts'), folder('lib')];

    test('sorts folders first by default', () => {
        assert.deepStrictEqual(names(applyOrder(entries, [], true)), ['lib', 'alpha.ts', 'zebra.ts']);
    });

    test('sorts purely alphabetically when folders first is off', () => {
        assert.deepStrictEqual(names(applyOrder(entries, [], false)), ['alpha.ts', 'lib', 'zebra.ts']);
    });

    test('puts ordered names first and sorts the rest', () => {
        assert.deepStrictEqual(names(applyOrder(entries, ['zebra.ts'], true)), ['zebra.ts', 'lib', 'alpha.ts']);
    });

    test('ignores names that are not present', () => {
        assert.deepStrictEqual(names(applyOrder(entries, ['gone.ts', 'zebra.ts'], true)), ['zebra.ts', 'lib', 'alpha.ts']);
    });

    test('lets a glob claim every entry it matches', () => {
        const styles = [file('index.ts'), file('b.css'), file('a.css')];
        assert.deepStrictEqual(names(applyOrder(styles, ['*.css'], false)), ['a.css', 'b.css', 'index.ts']);
    });

    test('does not mutate the input', () => {
        const input = [...entries];
        applyOrder(input, ['zebra.ts'], true);
        assert.deepStrictEqual(names(input), ['zebra.ts', 'alpha.ts', 'lib']);
    });
});

suite('moveSelection', () => {
    const order = ['a', 'b', 'c', 'd'];
    const move = (selected: string[], offset: -1 | 1) => moveSelection(order, new Set(selected), offset);

    test('moves a single entry up', () => {
        assert.deepStrictEqual(move(['c'], -1), ['a', 'c', 'b', 'd']);
    });

    test('moves a single entry down', () => {
        assert.deepStrictEqual(move(['b'], 1), ['a', 'c', 'b', 'd']);
    });

    test('moves an adjacent selection as one block', () => {
        assert.deepStrictEqual(move(['b', 'c'], -1), ['b', 'c', 'a', 'd']);
        assert.deepStrictEqual(move(['a', 'b'], 1), ['c', 'a', 'b', 'd']);
    });

    test('keeps a split selection in relative order', () => {
        assert.deepStrictEqual(move(['b', 'd'], -1), ['b', 'a', 'd', 'c']);
    });

    test('holds entries at the edge while the rest still move', () => {
        assert.deepStrictEqual(move(['a', 'c'], -1), ['a', 'c', 'b', 'd']);
        assert.deepStrictEqual(move(['b', 'd'], 1), ['a', 'c', 'b', 'd']);
    });

    test('returns null when nothing can move', () => {
        assert.strictEqual(move(['a'], -1), null);
        assert.strictEqual(move(['d'], 1), null);
        assert.strictEqual(move(['a', 'b'], -1), null);
        assert.strictEqual(move([], 1), null);
    });

    test('does not mutate the input', () => {
        move(['a', 'b'], 1);
        assert.deepStrictEqual(order, ['a', 'b', 'c', 'd']);
    });
});

suite('restoreToDefaultPosition', () => {
    const isDirectory = (name: string) => name === 'lib';

    test('moves a file back to its alphabetical slot', () => {
        const result = restoreToDefaultPosition(['zebra.ts', 'alpha.ts', 'lib'], file('alpha.ts'), isDirectory, true);
        assert.deepStrictEqual(result, ['alpha.ts', 'zebra.ts', 'lib']);
    });

    test('moves a folder ahead of files when folders come first', () => {
        const result = restoreToDefaultPosition(['a.ts', 'lib'], folder('lib'), isDirectory, true);
        assert.deepStrictEqual(result, ['lib', 'a.ts']);
    });

    test('appends when nothing sorts after it', () => {
        const result = restoreToDefaultPosition(['a.ts', 'c.ts'], file('c.ts'), isDirectory, false);
        assert.deepStrictEqual(result, ['a.ts', 'c.ts']);
    });
});

suite('migrateRules', () => {
    const root = path.resolve('/ws');

    test('rewrites absolute keys as workspace relative', () => {
        const raw = { [path.join(root, 'src')]: { order: ['index.ts'], type: 'manual' } };
        const { rules, changed } = migrateRules(raw, root);

        assert.deepStrictEqual(rules, { src: { order: ['index.ts'] } });
        assert.strictEqual(changed, true);
    });

    test('rewrites the workspace root key as "."', () => {
        const { rules } = migrateRules({ [root]: { order: ['src'] } }, root);
        assert.deepStrictEqual(rules, { '.': { order: ['src'] } });
    });

    test('drops rules for folders outside the workspace', () => {
        const raw = { 'c:\\vs\\other-project': { order: ['src'], type: 'manual' } };
        const { rules, changed } = migrateRules(raw, root);

        assert.deepStrictEqual(rules, {});
        assert.strictEqual(changed, true);
    });

    test('strips the obsolete type and patterns fields', () => {
        const raw = { src: { order: ['index.ts'], type: 'pattern', patterns: [{ pattern: '*.ts', priority: 1 }] } };
        const { rules, changed } = migrateRules(raw, root);

        assert.deepStrictEqual(rules, { src: { order: ['index.ts'] } });
        assert.strictEqual(changed, true);
    });

    test('drops malformed and empty rules', () => {
        const raw = { a: { order: 'not-an-array' }, b: {}, c: { order: [] }, d: null };
        const { rules, changed } = migrateRules(raw, root);

        assert.deepStrictEqual(rules, {});
        assert.strictEqual(changed, true);
    });

    test('leaves already migrated rules alone', () => {
        const raw = { '.': { order: ['src'] }, 'src/models': { order: ['a.ts', 'b.ts'] } };
        const { rules, changed } = migrateRules(raw, root);

        assert.deepStrictEqual(rules, raw);
        assert.strictEqual(changed, false);
    });

    test('handles a missing setting', () => {
        assert.deepStrictEqual(migrateRules(undefined, root), { rules: {}, changed: false });
    });
});
