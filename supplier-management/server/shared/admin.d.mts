export const BULK_FIELDS:Record<string,string[]>;
export function bulkPlan(target:string,command:Record<string,any>,source:Record<string,Record<string,any>[]>,actor:Record<string,string>):{action:string;ids:string[];count:number;items:Record<string,any>[];blockers:Record<string,any>[];plans:{recordId:string;fields:Record<string,any>}[];previewKey:string};
export function previewImport(target:string,command:Record<string,any>,source:Record<string,Record<string,any>[]>,actor:Record<string,string>):Record<string,any>[];
