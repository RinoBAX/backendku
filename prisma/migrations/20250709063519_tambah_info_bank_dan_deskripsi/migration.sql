-- AlterTable
ALTER TABLE `projects` ADD COLUMN `deskripsi` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `bankName` ENUM('EMPTY', 'BCA', 'MANDIRI', 'UOB', 'CIMB', 'BNI', 'BRI') NOT NULL DEFAULT 'EMPTY',
    ADD COLUMN `noRekening` VARCHAR(191) NULL;
