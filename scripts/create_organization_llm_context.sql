-- Migration: Create organization_llm_context table
-- Run this in your Supabase SQL editor.
--
-- This table stores pre-compiled LLM context documents per organisation,
-- keyed by a logical context name (e.g. 'brand_illustration').
-- Compiling is a deliberate step triggered via POST /api/brand/context.

CREATE TABLE IF NOT EXISTS public.organization_llm_context (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT        NOT NULL,
  key          TEXT        NOT NULL,
  value        JSONB,
  compiled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT organization_llm_context_org_key UNIQUE (org_id, key)
);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_organization_llm_context_updated_at'
  ) THEN
    CREATE TRIGGER set_organization_llm_context_updated_at
      BEFORE UPDATE ON public.organization_llm_context
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

-- RLS: only authenticated users in the same org can read; service-role can write
ALTER TABLE public.organization_llm_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read llm context"
  ON public.organization_llm_context
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "service role can manage llm context"
  ON public.organization_llm_context
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
