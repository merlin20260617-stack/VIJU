SELECT t.rec_id AS record_id, t."Code", t."Name", t."FactoryCode"
FROM "Warehouses" t CROSS JOIN "AccessRoles" r
WHERE ("User").id = CURRENT_USER_ID() AND (("Role").name = 'Admin' OR (("Role").name IN ('Warehouse','Viewer') AND (t."Code" = r."WarehouseCodes")))
ORDER BY t.rec_id
LIMIT 500 OFFSET $1
