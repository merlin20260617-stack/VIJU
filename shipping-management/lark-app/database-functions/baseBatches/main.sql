SELECT t.rec_id AS record_id, t."BatchKey", t."Reference", t."WarehouseCode", t."ProductCode", t."Quantity", t."ProducedAt"
FROM "ProductionBatches" t CROSS JOIN "AccessRoles" r
WHERE ("User").id = CURRENT_USER_ID() AND (("Role").name = 'Admin' OR (("Role").name IN ('Warehouse','Viewer') AND (t."WarehouseCode" = r."WarehouseCodes")))
ORDER BY t.rec_id
LIMIT 500 OFFSET $1
