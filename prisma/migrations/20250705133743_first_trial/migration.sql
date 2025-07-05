-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `kodeReferral` VARCHAR(191) NOT NULL,
    `statusRegistrasi` ENUM('PENDING', 'APPROVED') NOT NULL DEFAULT 'PENDING',
    `balance` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `picture` VARCHAR(191) NOT NULL,
    `uplineId` INTEGER NULL,
    `tglDibuat` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_kodeReferral_key`(`kodeReferral`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `projects` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `namaProyek` VARCHAR(191) NOT NULL,
    `iconUrl` VARCHAR(191) NOT NULL,
    `nilaiProyek` DECIMAL(65, 30) NOT NULL,
    `tglDibuat` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_fields` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `namaField` VARCHAR(191) NOT NULL,
    `tipeField` ENUM('TEXT', 'TEXTAREA', 'IMAGE', 'FILE') NOT NULL,
    `wajibDiisi` BOOLEAN NOT NULL DEFAULT true,
    `projectId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_submissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `noteAdmin` VARCHAR(191) NULL,
    `userId` INTEGER NOT NULL,
    `projectId` INTEGER NOT NULL,
    `tglDikirim` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tglDiproses` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `submission_data` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nilai` VARCHAR(191) NOT NULL,
    `submissionId` INTEGER NOT NULL,
    `fieldId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipe` ENUM('PENGERJAAN', 'KOMISI_UPLINE1', 'KOMISI_UPLINE2', 'PENARIKAN') NOT NULL,
    `jumlah` DECIMAL(65, 30) NOT NULL,
    `userId` INTEGER NOT NULL,
    `submissionId` INTEGER NULL,
    `withdrawalId` INTEGER NULL,
    `transactionDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `transactions_withdrawalId_key`(`withdrawalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `withdrawals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `totalWithdrawal` DECIMAL(65, 30) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `userId` INTEGER NOT NULL,
    `tglDiajukan` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tglDiproses` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_uplineId_fkey` FOREIGN KEY (`uplineId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_fields` ADD CONSTRAINT `project_fields_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_submissions` ADD CONSTRAINT `project_submissions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_submissions` ADD CONSTRAINT `project_submissions_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submission_data` ADD CONSTRAINT `submission_data_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `project_submissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submission_data` ADD CONSTRAINT `submission_data_fieldId_fkey` FOREIGN KEY (`fieldId`) REFERENCES `project_fields`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `project_submissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_withdrawalId_fkey` FOREIGN KEY (`withdrawalId`) REFERENCES `withdrawals`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `withdrawals` ADD CONSTRAINT `withdrawals_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
