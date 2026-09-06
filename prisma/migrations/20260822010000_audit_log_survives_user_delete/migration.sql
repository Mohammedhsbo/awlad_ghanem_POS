-- A staff member who had ever logged in could not be deleted: their login
-- audit rows pinned the account through AuditLog_userId_fkey. The trail should
-- outlive the account instead, with the actor anonymised.

-- DropForeignKey
ALTER TABLE "public"."AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

