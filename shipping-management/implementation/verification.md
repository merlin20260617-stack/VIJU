# Validation evidence — 2026-10-29

- Node.js v24.19.0: 20/20 domain and import tests passed.
- JavaScript syntax checks passed for page/app.mjs and page/xlsx.mjs.
- Browser: synthetic demo loaded; six customers appeared in 100-position board.
- Browser: completed SO-DEMO-001 (280 cartons); shipped changed 0 → 280, pending 1485 → 1205; completed order appeared in completed list.
- Browser: withdrew with reason; shipped changed 280 → 0, pending returned to 1485.
- Browser: imported synthetic two-sheet OOXML customer record; code 00009 preserved and visible in master list.
- Browser: selected product sheet; numeric code 88 formatted 00000 previewed as 00088, with 12 pcs/carton and 130 cartons/pallet.

All above actions used only local, synthetic data. Live Lark identities, persistent transactions, true concurrent users, platform permissions, ERP-generated workbooks, mobile layout and production deployment are **not verified**.

Reproduce Excel sample: `node tests/make-xlsx-fixtures.mjs`, then use the generated `tests/fixtures/erp-sample.xlsx` in the local import dialog. Fixtures are synthetic and excluded from Git.
