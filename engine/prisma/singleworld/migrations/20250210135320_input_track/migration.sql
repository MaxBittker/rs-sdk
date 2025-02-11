-- CreateTable
CREATE TABLE `input_report` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `account_id` INTEGER NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `session_uuid` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `input_report_event` (
    `input_report_id` INTEGER NOT NULL,
    `seq` INTEGER NOT NULL,
    `input_type` INTEGER NOT NULL DEFAULT -1,
    `delta` INTEGER NOT NULL,
    `coord` INTEGER NOT NULL,
    `mouse_x` INTEGER NULL,
    `mouse_y` INTEGER NULL,
    `key_code` INTEGER NULL,

    PRIMARY KEY (`input_report_id`, `seq`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

