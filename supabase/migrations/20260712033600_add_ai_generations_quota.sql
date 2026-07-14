ALTER TABLE public.users_profile
ADD COLUMN ai_generations_usage integer NOT NULL DEFAULT 0,
ADD COLUMN ai_generations_limit integer NOT NULL DEFAULT 10;
