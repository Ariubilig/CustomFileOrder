export interface OrderRule {
    folderPath: string;
    customOrder: string[];
    type: 'manual' | 'pattern' | 'template';
    patterns?: PatternRule[];
}

export interface PatternRule {
    pattern: string;
    priority: number;
    description?: string;
}

export interface OrderConfiguration {
    [folderPath: string]: {
        order: string[];
        type: 'manual' | 'pattern' | 'template';
        patterns?: PatternRule[];
        template?: string;
    };
}

export interface ProjectTemplate {
    name: string;
    description: string;
    rules: {
        [folderPath: string]: {
            order: string[];
            patterns?: PatternRule[];
        };
    };
}

// Predefined templates
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
    {
        name: 'React Project',
        description: 'Standard React project structure',
        rules: {
            'src': {
                order: ['index.js', 'App.jsx', 'components', 'hooks', 'pages', 'utils', 'assets', 'styles'],
                patterns: [
                    { pattern: 'index.*', priority: 1, description: 'Index files first' },
                    { pattern: 'App.*', priority: 2, description: 'App files second' }
                ]
            },
            'components': {
                order: ['index.js', '*.jsx', '*.js', '*.css', '*.module.css'],
                patterns: [
                    { pattern: 'index.*', priority: 1 },
                    { pattern: '*.jsx', priority: 2 },
                    { pattern: '*.js', priority: 3 },
                    { pattern: '*.css', priority: 4 }
                ]
            }
        }
    },
    {
        name: 'Vue Project',
        description: 'Standard Vue project structure',
        rules: {
            'src': {
                order: ['main.js', 'App.vue', 'components', 'views', 'router', 'store', 'assets'],
                patterns: [
                    { pattern: 'main.*', priority: 1 },
                    { pattern: 'App.*', priority: 2 }
                ]
            }
        }
    },
    {
        name: 'Node.js Project',
        description: 'Standard Node.js project structure',
        rules: {
            '.': {
                order: ['package.json', 'README.md', 'src', 'lib', 'test', 'docs', 'node_modules'],
                patterns: [
                    { pattern: 'package.json', priority: 1 },
                    { pattern: 'README.*', priority: 2 },
                    { pattern: '*.config.*', priority: 3 }
                ]
            },
            'src': {
                order: ['index.js', 'app.js', 'server.js', 'routes', 'controllers', 'models', 'middleware', 'utils']
            }
        }
    }
];