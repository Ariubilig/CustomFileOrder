export interface OrderRule {
    folderPath: string;
    customOrder: string[];
    type: 'manual' | 'pattern';
}

export interface OrderConfiguration {
    [folderPath: string]: {
        order: string[];
        type: 'manual' | 'pattern';
    };
}