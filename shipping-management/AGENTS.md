# VIJU shipping management

Independent project at `shipping-management/` in `merlin20260617-stack/VIJU`.
Do not reuse another VIJU application's IDs, data, credentials or deployments.
All stock units are cartons. Production matures at exactly producedAt + 24 hours.
The real Lark workspace is in lark-app/; read its AGENTS.md and catalog.json. The root page/ is an isolated local demonstration, not the real application.
The user explicitly approved a separate transactional inventory store and Lark reporting projections. transaction-service/ implements D1 atomic revision checks, receipts and durable sync jobs. Preserve its private owner-only access boundary.
Never replace transactional stock constraints with sequential Base record writes or client-side authorization. Read the installed lark-base-database skill before changing live behavior.
Credentials must stay in server configuration, never Page, source or Git. Publish Lark Preview first; production requires experience and approval of the same Preview artifact.
Preserve order product and pallet snapshots when master data changes. Withdraw before editing a completed order.
