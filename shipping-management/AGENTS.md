# VIJU shipping management

Independent sibling project in merlin20260617-stack/VIJU. Runtime and all business data must stay in Lark; GitHub stores source. Do not add paid external services, infrastructure, subscription upgrades or extra usage charges without explaining necessity, provider/data location, price and Lark alternatives and obtaining explicit user confirmation. This supersedes the earlier approval of an external transaction store.

Read lark-app/AGENTS.md and catalog.json. Lark Base APIs do not expose transactions/CAS. The agreed workflow records actual shipments after physical dispatch, with one operator at a time per warehouse and independent stock per warehouse. Never claim strict concurrent inventory or idempotency guarantees. Preserve request receipts and stop on uncertain/partial writes. Unknown creation is never blindly retried.

Warehouse/Viewer roles currently have one exact warehouse code per user; SQL and FaaS both enforce roles. Admin sees all warehouses. Credentials never enter source or Page. Publish Preview first; Prod requires experience and authorization for the exact artifact. Keep unrelated VIJU platforms independent.
