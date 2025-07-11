/*
  Warnings:

  - Added the required column `creatorId` to the `HistoryYoutubeApps` table without a default value. This is not possible if the table is not empty.
  - Added the required column `creatorId` to the `YoutubeApps` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `HistoryYoutubeApps` ADD COLUMN `creatorId` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `YoutubeApps` ADD COLUMN `creatorId` INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE `YoutubeApps` ADD CONSTRAINT `YoutubeApps_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoryYoutubeApps` ADD CONSTRAINT `HistoryYoutubeApps_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
