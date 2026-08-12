import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	// The extension bails out without a workspace folder, so tests need one.
	workspaceFolder: './src/test/fixtures/workspace',
	mocha: {
		ui: 'tdd'
	}
});
