-- CreateTable
CREATE TABLE "post" (
    "id" BIGSERIAL NOT NULL,
    "comment" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,

    CONSTRAINT "post_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
