CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE media_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     VARCHAR(255) NOT NULL,
  type        VARCHAR(10)  NOT NULL CHECK (type IN ('anime','movie','tv','music')),
  title       VARCHAR(255),
  status      VARCHAR(10)  NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished')),
  notes       TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE episode_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id        UUID NOT NULL REFERENCES media_entries(id) ON DELETE CASCADE,
  current_season  INT  NOT NULL DEFAULT 1,
  current_episode INT  NOT NULL DEFAULT 1,
  UNIQUE(entry_id)
);

CREATE TABLE music_details (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES media_entries(id) ON DELETE CASCADE,
  artist   VARCHAR(255),
  album    VARCHAR(255),
  song     VARCHAR(255),
  UNIQUE(entry_id),
  CONSTRAINT at_least_one_field CHECK (
    artist IS NOT NULL OR album IS NOT NULL OR song IS NOT NULL
  )
);

CREATE TABLE ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    UUID NOT NULL REFERENCES media_entries(id) ON DELETE CASCADE,
  rating      VARCHAR(10) CHECK (rating IN ('thumbs_up','thumbs_down')),
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entry_id)
);

CREATE INDEX idx_entries_user  ON media_entries(user_id);
CREATE INDEX idx_entries_type  ON media_entries(type);
CREATE INDEX idx_entries_status ON media_entries(status);
