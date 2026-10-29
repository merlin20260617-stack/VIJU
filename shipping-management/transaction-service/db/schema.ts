import {integer,sqliteTable,text,primaryKey} from 'drizzle-orm/sqlite-core';
export const revisions=sqliteTable('revisions',{key:text('key').primaryKey(),version:integer('version').notNull(),lastRequest:text('last_request').notNull(),syncLock:text('sync_lock').notNull().default('')});
export const entities=sqliteTable('entities',{collection:text('collection').notNull(),entityKey:text('entity_key').notNull(),payload:text('payload').notNull()},t=>[primaryKey({columns:[t.collection,t.entityKey]})]);
export const receipts=sqliteTable('receipts',{requestId:text('request_id').primaryKey(),fingerprint:text('fingerprint').notNull(),version:integer('version').notNull(),at:text('at').notNull()});
export const outbox=sqliteTable('outbox',{id:text('id').primaryKey(),version:integer('version').notNull(),part:integer('part').notNull(),payload:text('payload').notNull(),status:text('status').notNull(),lease:text('lease'),error:text('error')});
export const projections=sqliteTable('projections',{entityKey:text('entity_key').primaryKey(),recordId:text('record_id').notNull()});
