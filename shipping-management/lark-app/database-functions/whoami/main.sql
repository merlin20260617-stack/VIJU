SELECT rec_id AS member_id, ("User").id AS user_id, ("Role").name AS role, "WarehouseCodes" AS warehouse_codes
FROM "AccessRoles"
WHERE ("User").id = CURRENT_USER_ID()
LIMIT 2
