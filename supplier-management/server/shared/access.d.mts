export const PERMISSIONS:string[][];
export const LEGACY:Record<string,string[]>;
export function permissionsFor(member:Record<string,any>):string[];
export function has(actor:Record<string,any>,permission:string):boolean;
