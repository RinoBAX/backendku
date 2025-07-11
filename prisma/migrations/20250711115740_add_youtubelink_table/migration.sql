-- AlterTable
ALTER TABLE `submissions` ADD COLUMN `youtubeAppsId` INTEGER NULL;

-- CreateTable
CREATE TABLE `YoutubeApps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `urlYoutube` VARCHAR(191) NOT NULL,
    `tglDibuat` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tglDiperbarui` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HistoryYoutubeApps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `urlYoutube` VARCHAR(191) NOT NULL,
    `tglDibuat` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `youtubeAppsId` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_youtubeAppsId_fkey` FOREIGN KEY (`youtubeAppsId`) REFERENCES `YoutubeApps`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoryYoutubeApps` ADD CONSTRAINT `HistoryYoutubeApps_youtubeAppsId_fkey` FOREIGN KEY (`youtubeAppsId`) REFERENCES `YoutubeApps`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
