-- CreateTable
CREATE TABLE app_user (
    "id" BIGSERIAL PRIMARY KEY,
    "firstname" TEXT NOT NULL,
    "lastname" TEXT NOT NULL,
    "email" TEXT NOT NULL
);
