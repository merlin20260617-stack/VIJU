export const DEPENDENCIES:Record<string,string[]>;
export function normalizePermissions(input:unknown):string[];
export function governancePlan(target:string,command:Record<string,any>,source:Record<string,Record<string,any>[]>,actor:Record<string,any>):{recordId:string|null;fields:Record<string,any>};
