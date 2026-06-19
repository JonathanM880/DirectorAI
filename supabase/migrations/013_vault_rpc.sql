-- Migration: 013_vault_rpc
-- Purpose: Exposes secure RPC wrapper functions in the public schema for vault operations,
-- restricted to the service_role to ensure maximum security.

-- 1. Store/create secret function
CREATE OR REPLACE FUNCTION public.vault_store_secret(
  p_user_id UUID,
  p_key_name TEXT,
  p_secret TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_name TEXT;
  v_secret_id UUID;
BEGIN
  v_secret_name := p_user_id::text || ':' || p_key_name;
  
  -- Find if secret already exists
  SELECT id INTO v_secret_id FROM vault.secrets WHERE name = v_secret_name LIMIT 1;
  
  IF v_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_secret_id, p_secret);
  ELSE
    PERFORM vault.create_secret(p_secret, v_secret_name, 'Vault secret for user ' || p_user_id::text);
  END IF;
END;
$$;

-- 2. Get decrypted secret function
CREATE OR REPLACE FUNCTION public.vault_get_secret(
  p_user_id UUID,
  p_key_name TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_name TEXT;
  v_decrypted TEXT;
BEGIN
  v_secret_name := p_user_id::text || ':' || p_key_name;
  
  SELECT decrypted_secret INTO v_decrypted 
  FROM vault.decrypted_secrets 
  WHERE name = v_secret_name LIMIT 1;
  
  RETURN v_decrypted;
END;
$$;

-- 3. Delete secret function
CREATE OR REPLACE FUNCTION public.vault_delete_secret(
  p_user_id UUID,
  p_key_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_name TEXT;
BEGIN
  v_secret_name := p_user_id::text || ':' || p_key_name;
  DELETE FROM vault.secrets WHERE name = v_secret_name;
END;
$$;

-- 4. List secret names function
CREATE OR REPLACE FUNCTION public.vault_list_secrets(
  p_user_id UUID
)
RETURNS TABLE (key_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT substring(name from length(p_user_id::text) + 2)
  FROM vault.secrets
  WHERE name LIKE p_user_id::text || ':%';
END;
$$;

-- Revoke all execute rights from public, authenticated and anon
REVOKE EXECUTE ON FUNCTION public.vault_store_secret FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vault_get_secret FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vault_delete_secret FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vault_list_secrets FROM public, anon, authenticated;

-- Grant execution rights to service_role ONLY
GRANT EXECUTE ON FUNCTION public.vault_store_secret TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_get_secret TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_delete_secret TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_list_secrets TO service_role;
