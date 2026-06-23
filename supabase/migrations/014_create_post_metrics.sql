-- Migration 014: Create post_metrics table for analytics (Task 4.1)
CREATE TABLE IF NOT EXISTS public.post_metrics (
    post_id UUID PRIMARY KEY REFERENCES public.scheduled_posts(id) ON DELETE CASCADE,
    platform_message_id TEXT NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    reactions JSONB NOT NULL DEFAULT '{}'::jsonb,
    forwards INTEGER NOT NULL DEFAULT 0,
    replies INTEGER NOT NULL DEFAULT 0,
    measured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for efficient querying by measured_at (trend)
CREATE INDEX IF NOT EXISTS idx_post_metrics_measured_at ON public.post_metrics(measured_at);

-- Set up Row Level Security
ALTER TABLE public.post_metrics ENABLE ROW LEVEL SECURITY;

-- Users can only read metrics for their own posts
CREATE POLICY "Users can view metrics for their own posts" 
    ON public.post_metrics 
    FOR SELECT 
    USING (
        post_id IN (
            SELECT id FROM public.scheduled_posts WHERE user_id = auth.uid()
        )
    );

-- Only service role (Edge Functions) can insert/update metrics
CREATE POLICY "Service role can manage metrics" 
    ON public.post_metrics 
    FOR ALL 
    USING (auth.jwt() ->> 'role' = 'service_role')
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
