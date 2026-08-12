import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'RARI.custom-file-order';

suite('Extension Test Suite', () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);

    test('the extension is present', () => {
        assert.ok(extension, `${EXTENSION_ID} was not found`);
    });

    test('keybindings are contributed', () => {
        // They used to sit outside "contributes", where VS Code ignored them.
        const keybindings = extension!.packageJSON.contributes?.keybindings;
        assert.ok(Array.isArray(keybindings) && keybindings.length > 0);
    });

    test('every contributed keybinding and menu points at a real command', () => {
        const contributes = extension!.packageJSON.contributes;
        const declared = new Set<string>(contributes.commands.map((command: any) => command.command));

        const referenced: string[] = [
            ...contributes.keybindings.map((binding: any) => binding.command),
            ...Object.values(contributes.menus as Record<string, any[]>)
                .flat()
                .map((entry: any) => entry.command)
        ];

        for (const command of referenced) {
            assert.ok(declared.has(command), `${command} is referenced but never declared`);
        }
    });

    test('activating registers every contributed command', async () => {
        await extension!.activate();
        const registered = new Set(await vscode.commands.getCommands(true));

        for (const command of extension!.packageJSON.contributes.commands) {
            assert.ok(registered.has(command.command), `${command.command} was not registered`);
        }
    });
});
