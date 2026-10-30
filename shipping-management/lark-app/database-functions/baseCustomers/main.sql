SELECT t.rec_id AS record_id, t."Code", t."Name"
FROM "Customers" t CROSS JOIN "AccessRoles" r
WHERE ("User").id = CURRENT_USER_ID() AND ("Role").name IN ('Admin','Warehouse','Viewer')
ORDER BY t.rec_id
LIMIT 500 OFFSET $1
