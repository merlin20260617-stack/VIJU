import type {State} from './shipping.mjs';
export type Row=Record<string,any>;
export type Source=Record<string,Row[]>;
export type Plan={table:string;key:string;recordId:string|null;fields:Row;deleted?:boolean};
export function canonical(value:unknown):string;
export function versionOf(state:State):number;
export function decode(source:Source):{state:State;receipts:Row[]};
export function planWrites(source:Source,previous:State,next:State,command:any):Plan[];
export function matchesPlan(source:Source,plan:Plan[]):boolean;

