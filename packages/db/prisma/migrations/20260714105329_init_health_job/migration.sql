-- CreateTable
CREATE TABLE "health_jobs" (
    "id" UUID NOT NULL,
    "request_id" TEXT NOT NULL,
    "enqueued_at" TIMESTAMPTZ(3) NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_jobs_pkey" PRIMARY KEY ("id")
);
