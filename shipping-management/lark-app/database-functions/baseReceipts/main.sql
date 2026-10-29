SELECT t.rec_id AS record_id, t."RequestKey", (t."Status").name AS "Status", t."Details", t."TransactionVersion"
FROM "SyncReceipts" t CROSS JOIN "AccessRoles" r
WHERE ("User").id = CURRENT_USER_ID() AND (("Role").name = 'Admin' OR (("Role").name IN ('Warehouse','Viewer') AND (t."TransactionVersion" = r."WarehouseCodes" OR t."TransactionVersion" = '*')))
ORDER BY t.rec_id
LIMIT 500 OFFSET $1
