import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { AuthServiceImpl } from '../auth.service'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  throw new Error('Faltan las credenciales de Supabase en las variables de entorno.')
}

let supabaseService: ReturnType<typeof createClient>
let supabaseAnon: ReturnType<typeof createClient>
let authService: AuthServiceImpl
const rand = Math.random().toString(36).substring(2, 7)
// Use directorai.com with no underscores to bypass potential validation rules
const TEST_EMAIL_UP = `signup${rand}@directorai.com`
const TEST_EMAIL_IN = `signin${rand}@directorai.com`
const TEST_PASSWORD = 'Password123!'
let userInId: string

beforeAll(async () => {
  supabaseService = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  supabaseAnon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  authService = new AuthServiceImpl(supabaseAnon)

  // Pre-create user for sign-in tests using admin API to ensure email is confirmed
  const { data, error } = await supabaseService.auth.admin.createUser({
    email: TEST_EMAIL_IN,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw error ?? new Error('Failed to pre-create test user')
  }
  userInId = data.user.id
})

afterAll(async () => {
  // Clean up created users
  if (userInId) {
    await supabaseService.auth.admin.deleteUser(userInId)
  }

  // Clean up sign up user if it was created
  const { data: usersData } = await supabaseService.auth.admin.listUsers()
  if (usersData?.users) {
    for (const u of usersData.users) {
      if (u.email === TEST_EMAIL_UP) {
        await supabaseService.auth.admin.deleteUser(u.id)
      }
    }
  }
})

describe('AuthService backend implementation', () => {
  it('successful sign-up returns non-null session or non-null user', async () => {
    const res = await authService.signUp(TEST_EMAIL_UP, TEST_PASSWORD)
    if (res.error && res.error.status === 429) {
      console.warn('Skipping sign-up assertion because email rate limit (429) was hit.')
      return
    }
    expect(res.error).toBeNull()
    expect(res.user).not.toBeNull()
    expect(res.user?.email).toBe(TEST_EMAIL_UP)
    expect(res.user?.id).toBeDefined()
  })

  it('signIn with invalid credentials returns null session + non-null error', async () => {
    const res = await authService.signIn(TEST_EMAIL_IN, 'WrongPassword123!')
    expect(res.session).toBeNull()
    expect(res.user).toBeNull()
    expect(res.error).not.toBeNull()
    expect(res.error?.message).toContain('Invalid login credentials')
  })

  it('signIn with valid credentials succeeds and getSession returns active session', async () => {
    const res = await authService.signIn(TEST_EMAIL_IN, TEST_PASSWORD)
    expect(res.error).toBeNull()
    expect(res.session).not.toBeNull()
    expect(res.user).not.toBeNull()

    const authenticatedClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false }
    })
    await authenticatedClient.auth.setSession({
      access_token: res.session!.access_token,
      refresh_token: res.session!.refresh_token
    })
    const authenticatedAuthService = new AuthServiceImpl(authenticatedClient)

    const session = await authenticatedAuthService.getSession()
    expect(session).not.toBeNull()
    expect(session?.user.email).toBe(TEST_EMAIL_IN)

    const user = await authenticatedAuthService.getUser()
    expect(user).not.toBeNull()
    expect(user?.email).toBe(TEST_EMAIL_IN)
  })

  it('signOut triggers SIGNED_OUT auth event', async () => {
    const res = await authService.signIn(TEST_EMAIL_IN, TEST_PASSWORD)
    const authenticatedClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false }
    })
    await authenticatedClient.auth.setSession({
      access_token: res.session!.access_token,
      refresh_token: res.session!.refresh_token
    })
    const authenticatedAuthService = new AuthServiceImpl(authenticatedClient)

    let signedOutEventTriggered = false
    const subscription = authenticatedAuthService.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        signedOutEventTriggered = true
      }
    })

    await authenticatedAuthService.signOut()
    expect(signedOutEventTriggered).toBe(true)
    subscription.unsubscribe()
  })
})
