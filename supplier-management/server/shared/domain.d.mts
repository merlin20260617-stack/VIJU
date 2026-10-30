export class BusinessError extends Error {}
export const OPTIONS: Record<string,string[]>;
export function canonical(value: unknown): string;
export function authorize(role:string, action:string,permissions?:string[]):void;
export function validate(action:string,input:Record<string,unknown>,source:Record<string,Record<string,any>[]>,actor:Record<string,string>):{recordId:string|null,fields:Record<string,any>};
export function importPlan(action:string,mode:string,rows:unknown[],source:Record<string,Record<string,any>[]>,actor:Record<string,any>,limit?:number,options?:{matchBy?:string}):{recordId:string|null,fields:Record<string,any>}[];
