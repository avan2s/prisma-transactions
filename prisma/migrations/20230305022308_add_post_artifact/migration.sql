/*
  Warnings:

  - Added the required column `post_artifact_id` to the `post` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "post" ADD COLUMN     "post_artifact_id" BIGINT NOT NULL;

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_post_artifact_id_fkey" FOREIGN KEY ("post_artifact_id") REFERENCES "post_artifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
