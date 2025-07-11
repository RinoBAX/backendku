-- AlterTable
ALTER TABLE `transactions` MODIFY `tipe` ENUM('PENGERJAAN_PROYEK', 'KOMISI_UPLINE_1', 'KOMISI_UPLINE_2', 'PENARIKAN_DANA', 'BONUS_OPERASIONAL', 'LEVEL_GAJI') NOT NULL;

-- CreateTable
CREATE TABLE `News` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `imageNews` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `newsUrl` VARCHAR(191) NULL,
    `tglDibuat` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tglDiperbarui` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Level` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `salary` INTEGER NOT NULL,
    `submissionId` INTEGER NULL,
    `level` INTEGER NOT NULL,
    `tglDibuat` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tglDiperbarui` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LevelHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `levelId` INTEGER NULL,
    `userId` INTEGER NOT NULL,
    `tglDibuat` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Level` ADD CONSTRAINT `Level_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Level` ADD CONSTRAINT `Level_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LevelHistory` ADD CONSTRAINT `LevelHistory_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LevelHistory` ADD CONSTRAINT `LevelHistory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
