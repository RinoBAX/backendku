-- CreateTable
CREATE TABLE `ContactAdmin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `phoneNumber` INTEGER NOT NULL,
    `tglDibuat` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creatorId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HistoryContactAdmin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `phoneNumber` INTEGER NOT NULL,
    `creatorId` INTEGER NOT NULL,
    `tglDibuat` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tglDiperbarui` DATETIME(3) NOT NULL,
    `contactAdminId` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ContactAdmin` ADD CONSTRAINT `ContactAdmin_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoryContactAdmin` ADD CONSTRAINT `HistoryContactAdmin_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoryContactAdmin` ADD CONSTRAINT `HistoryContactAdmin_contactAdminId_fkey` FOREIGN KEY (`contactAdminId`) REFERENCES `ContactAdmin`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
