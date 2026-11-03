-- Coach-controlled slot length. Existing coaches retain the established one-hour default.
ALTER TABLE "coach_profiles" ADD COLUMN "session_duration_minutes" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_session_duration_positive" CHECK ("session_duration_minutes" > 0);
