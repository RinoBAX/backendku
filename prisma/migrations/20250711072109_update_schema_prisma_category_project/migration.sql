/*
  Warnings:

  - You are about to drop the column `Category` on the `projects` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `projects` DROP COLUMN `Category`,
    ADD COLUMN `category` VARCHAR(191) NULL;
