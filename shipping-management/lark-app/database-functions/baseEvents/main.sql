SELECT t.rec_id AS record_id, t."EventKey", t."OrderKeys", (t."Action").name AS "Action", t."ActorId", t."OccurredAt", t."Reason", t."PayloadJson", t."SyncVersion"
FROM "DispatchEvents" t CROSS JOIN "AccessRoles" r
WHERE ("User").id = CURRENT_USER_ID() AND ("Role").name = 'Admin'
ORDER BY t.rec_id
LIMIT 500 OFFSET $1
