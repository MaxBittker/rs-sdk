-- CreateTable
CREATE TABLE "player_telemetry_segment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "session_uuid" TEXT,
    "ip" TEXT,
    "start_time" DATETIME NOT NULL,
    "end_time" DATETIME NOT NULL,
    "sample_count" INTEGER NOT NULL,
    "data" BLOB NOT NULL
);

-- CreateIndex
CREATE INDEX "player_telemetry_segment_username_start_time_idx" ON "player_telemetry_segment"("username", "start_time");

-- CreateIndex
CREATE INDEX "player_telemetry_segment_start_time_idx" ON "player_telemetry_segment"("start_time");

-- CreateTable
CREATE TABLE "player_skills_log" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL,
    "username" TEXT NOT NULL,
    "total_xp" INTEGER NOT NULL,
    "skills" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "player_skills_log_username_timestamp_idx" ON "player_skills_log"("username", "timestamp");
