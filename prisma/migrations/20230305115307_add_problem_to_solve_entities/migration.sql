-- CreateTable
CREATE TABLE "artifacts" (
    "ID" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "assignedSite" INTEGER NOT NULL,
    "notes" VARCHAR(255) NOT NULL DEFAULT 'No notes available',
    "owner" INTEGER NOT NULL,
    "assignedImage" VARCHAR(32),
    "category" INTEGER NOT NULL,
    "epoch" INTEGER,
    "material" VARCHAR(100),
    "length" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "isShared" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "artifact_category" (
    "ID" SERIAL NOT NULL,
    "category_name" TEXT NOT NULL,

    CONSTRAINT "artifact_category_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "excavation_sites" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "epoch" INTEGER NOT NULL,
    "note" VARCHAR(255) NOT NULL DEFAULT 'No notes available',
    "owner" INTEGER NOT NULL,
    "category" INTEGER NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "excavation_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "epochs" (
    "ID" SERIAL NOT NULL,
    "name" VARCHAR(45) NOT NULL,
    "category" INTEGER NOT NULL,

    CONSTRAINT "epochs_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "epoch_categories" (
    "ID" SERIAL NOT NULL,
    "Value" VARCHAR(50) NOT NULL,

    CONSTRAINT "epoch_categories_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "excavation_site_categories" (
    "ID" SERIAL NOT NULL,
    "Name" VARCHAR(50) NOT NULL,
    "IsCustom" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "excavation_site_categories_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "users" (
    "ID" SERIAL NOT NULL,
    "firstname" VARCHAR(45) NOT NULL,
    "lastname" VARCHAR(45) NOT NULL,
    "phone" VARCHAR(60) NOT NULL,
    "email" VARCHAR(45) NOT NULL,
    "username" VARCHAR(45) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "role" INTEGER NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "Avatar" VARCHAR(36),

    CONSTRAINT "users_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "qrcodes" (
    "ID" SERIAL NOT NULL,
    "Identifier" VARCHAR(36) NOT NULL,
    "Content" TEXT NOT NULL,
    "Reference" INTEGER NOT NULL,

    CONSTRAINT "qrcodes_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "shared_entities" (
    "ID" SERIAL NOT NULL,
    "Artifact" INTEGER,
    "ExcavationSite" INTEGER,
    "User" INTEGER NOT NULL,

    CONSTRAINT "shared_entities_pkey" PRIMARY KEY ("ID")
);

-- CreateTable
CREATE TABLE "UserSetting" (
    "ID" SERIAL NOT NULL,
    "setting_name" TEXT NOT NULL,
    "setting_value" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "UserSetting_pkey" PRIMARY KEY ("ID")
);

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_ID_key" ON "artifacts"("ID");

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_name_key" ON "artifacts"("name");

-- CreateIndex
CREATE UNIQUE INDEX "artifact_category_ID_key" ON "artifact_category"("ID");

-- CreateIndex
CREATE UNIQUE INDEX "excavation_sites_id_key" ON "excavation_sites"("id");

-- CreateIndex
CREATE UNIQUE INDEX "epochs_ID_key" ON "epochs"("ID");

-- CreateIndex
CREATE UNIQUE INDEX "epochs_name_key" ON "epochs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "epoch_categories_ID_key" ON "epoch_categories"("ID");

-- CreateIndex
CREATE UNIQUE INDEX "excavation_site_categories_ID_key" ON "excavation_site_categories"("ID");

-- CreateIndex
CREATE UNIQUE INDEX "excavation_site_categories_Name_key" ON "excavation_site_categories"("Name");

-- CreateIndex
CREATE UNIQUE INDEX "users_ID_key" ON "users"("ID");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_Avatar_key" ON "users"("Avatar");

-- CreateIndex
CREATE UNIQUE INDEX "qrcodes_ID_key" ON "qrcodes"("ID");

-- CreateIndex
CREATE UNIQUE INDEX "qrcodes_Identifier_key" ON "qrcodes"("Identifier");

-- CreateIndex
CREATE UNIQUE INDEX "qrcodes_Reference_key" ON "qrcodes"("Reference");

-- CreateIndex
CREATE UNIQUE INDEX "shared_entities_ID_key" ON "shared_entities"("ID");

-- CreateIndex
CREATE UNIQUE INDEX "UserSetting_ID_key" ON "UserSetting"("ID");

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_assignedSite_fkey" FOREIGN KEY ("assignedSite") REFERENCES "excavation_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_owner_fkey" FOREIGN KEY ("owner") REFERENCES "users"("ID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_category_fkey" FOREIGN KEY ("category") REFERENCES "artifact_category"("ID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_epoch_fkey" FOREIGN KEY ("epoch") REFERENCES "epochs"("ID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excavation_sites" ADD CONSTRAINT "excavation_sites_epoch_fkey" FOREIGN KEY ("epoch") REFERENCES "epochs"("ID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excavation_sites" ADD CONSTRAINT "excavation_sites_owner_fkey" FOREIGN KEY ("owner") REFERENCES "users"("ID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excavation_sites" ADD CONSTRAINT "excavation_sites_category_fkey" FOREIGN KEY ("category") REFERENCES "excavation_site_categories"("ID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "epochs" ADD CONSTRAINT "epochs_category_fkey" FOREIGN KEY ("category") REFERENCES "epoch_categories"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qrcodes" ADD CONSTRAINT "qrcodes_Reference_fkey" FOREIGN KEY ("Reference") REFERENCES "artifacts"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_entities" ADD CONSTRAINT "shared_entities_Artifact_fkey" FOREIGN KEY ("Artifact") REFERENCES "artifacts"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_entities" ADD CONSTRAINT "shared_entities_ExcavationSite_fkey" FOREIGN KEY ("ExcavationSite") REFERENCES "excavation_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_entities" ADD CONSTRAINT "shared_entities_User_fkey" FOREIGN KEY ("User") REFERENCES "users"("ID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSetting" ADD CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("ID") ON DELETE RESTRICT ON UPDATE CASCADE;
