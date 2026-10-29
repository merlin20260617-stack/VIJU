# VIJU Shipping Transaction Service

Private D1 transaction backend for the independent VIJU Lark shipping application. The Lark FaaS bridge supplies verified identity and warehouse scope. The platform-issued service credential stays only in the Lark server environment.

Inventory state, optimistic revision, durable request receipt and Lark synchronization outbox are committed in one D1 batch transaction. Failed compare-and-swap writes do not apply entity changes. Unknown Lark writes stop synchronization for manual review.

Access boundary: this service must remain owner-private. It relies on Sites dispatch authentication for the machine endpoint. Do not expand the Site audience or make it public without adding independent service-only authentication. Browser clients must use Lark instead of calling this API.

Schema is managed by Drizzle migrations. Domain code is copied from ../domain/shipping.mjs and must stay identical. The initial snapshot implementation refuses to operate above 20,000 entity/audit rows; partitioned queries are required before that threshold.
