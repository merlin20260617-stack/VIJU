# VIJU shipping management

Independent project at `shipping-management/` in `merlin20260617-stack/VIJU`.
Do not reuse another VIJU application's IDs, data, credentials or deployments.
All stock units are cartons. Production matures at exactly producedAt + 24 hours.
No live Lark binding is configured. Browser preview is explicitly a local demonstration.
Before implementing live writes, obtain the installed lark-base-database skill and real Catalog, then verify atomic conditional writes, permissions, idempotency and recovery.
Never replace these requirements with sequential Base record writes or client-side authorization.
Preserve order product and pallet snapshots when master data changes. Withdraw before editing a completed order.
