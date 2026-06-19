import { SupabaseClient } from '@supabase/supabase-js'
import { KeyVaultService, KeyName } from '@director-ai/types'

export class KeyVaultServiceImpl implements KeyVaultService {
  constructor(private supabase: SupabaseClient) {}

  async storeKey(userId: string, keyName: KeyName, value: string): Promise<void> {
    const { error: storeError } = await this.supabase.rpc('vault_store_secret', {
      p_user_id: userId,
      p_key_name: keyName,
      p_secret: value,
    })

    if (storeError) {
      throw storeError
    }

    const { error: auditError } = await this.supabase.from('audit_log').insert({
      user_id: userId,
      action: 'edited',
      platform: 'vault',
      metadata: { keyName, operation: 'storeKey' },
    })

    if (auditError) {
      throw auditError
    }
  }

  async getKey(userId: string, keyName: KeyName): Promise<string> {
    const { data, error } = await this.supabase.rpc('vault_get_secret', {
      p_user_id: userId,
      p_key_name: keyName,
    })

    if (error) {
      throw error
    }

    if (!data) {
      throw new Error(`Key ${keyName} not found for user ${userId}`)
    }

    return data
  }

  async rotateKey(userId: string, keyName: KeyName, newValue: string): Promise<void> {
    const { error: storeError } = await this.supabase.rpc('vault_store_secret', {
      p_user_id: userId,
      p_key_name: keyName,
      p_secret: newValue,
    })

    if (storeError) {
      throw storeError
    }

    const { error: auditError } = await this.supabase.from('audit_log').insert({
      user_id: userId,
      action: 'edited',
      platform: 'vault',
      metadata: { keyName, operation: 'rotateKey' },
    })

    if (auditError) {
      throw auditError
    }
  }

  async deleteKey(userId: string, keyName: KeyName): Promise<void> {
    const { error: deleteError } = await this.supabase.rpc('vault_delete_secret', {
      p_user_id: userId,
      p_key_name: keyName,
    })

    if (deleteError) {
      throw deleteError
    }

    const { error: auditError } = await this.supabase.from('audit_log').insert({
      user_id: userId,
      action: 'deleted',
      platform: 'vault',
      metadata: { keyName, operation: 'deleteKey' },
    })

    if (auditError) {
      throw auditError
    }
  }

  async listKeyNames(userId: string): Promise<KeyName[]> {
    const { data, error } = await this.supabase.rpc('vault_list_secrets', {
      p_user_id: userId,
    })

    if (error) {
      throw error
    }

    if (!data) {
      return []
    }

    return (data as { key_name: string }[]).map(row => row.key_name as KeyName)
  }
}
