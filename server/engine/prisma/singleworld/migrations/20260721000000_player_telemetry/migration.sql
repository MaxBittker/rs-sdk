-- CreateTable
CREATE TABLE "player_telemetry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL,
    "username" TEXT NOT NULL,
    "session_uuid" TEXT,
    "x" INTEGER NOT NULL,
    "z" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "ip" TEXT,
    "total_xp" INTEGER NOT NULL DEFAULT 0,
    "skills" TEXT
);

-- CreateIndex
CREATE INDEX "player_telemetry_username_timestamp_idx" ON "player_telemetry"("username", "timestamp");

-- CreateIndex
CREATE INDEX "player_telemetry_timestamp_idx" ON "player_telemetry"("timestamp");
