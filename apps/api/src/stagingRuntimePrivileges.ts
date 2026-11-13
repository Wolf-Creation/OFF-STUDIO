const EXPECTED_USERNAME = 'off_studio_staging_app'
const EXPECTED_ROLE = 'offStudioStagingRuntime'
const EXPECTED_DATABASE = 'off_studio_staging'
const EXPECTED_ACTIONS = ['find', 'insert', 'update', 'remove', 'createCollection', 'createIndex']

export interface StagingPrivilegeStatus {
  authInfo?: {
    authenticatedUsers?: Array<{ user?: string; db?: string }>
    authenticatedUserRoles?: Array<{ role?: string; db?: string }>
    authenticatedUserPrivileges?: Array<{
      resource?: { db?: string; collection?: string; anyResource?: boolean }
      actions?: string[]
    }>
  }
}

export interface StagingPrivilegeValidation {
  valid: boolean
  errors: string[]
}

export function validateStagingRuntimePrivileges(status: StagingPrivilegeStatus): StagingPrivilegeValidation {
  const errors: string[] = []
  const authInfo = status.authInfo
  const users = authInfo?.authenticatedUsers ?? []
  const roles = authInfo?.authenticatedUserRoles ?? []
  const privileges = authInfo?.authenticatedUserPrivileges ?? []

  if (users.length !== 1 || users[0]?.user !== EXPECTED_USERNAME || users[0]?.db !== 'admin') {
    errors.push('Authenticated user does not exactly match the staging runtime user.')
  }
  if (roles.length !== 1 || roles[0]?.role !== EXPECTED_ROLE || roles[0]?.db !== 'admin') {
    errors.push('Authenticated roles do not exactly match the staging runtime role.')
  }
  if (privileges.length === 0) {
    errors.push('No effective privileges were reported.')
  }

  const effectiveActions = new Set<string>()
  for (const privilege of privileges) {
    const resource = privilege.resource
    if (resource?.anyResource || resource?.db !== EXPECTED_DATABASE || resource?.collection !== '') {
      errors.push('An effective privilege is not scoped to all collections in the staging database.')
    }

    for (const action of privilege.actions ?? []) {
      effectiveActions.add(action)
    }
  }

  const expectedActions = new Set(EXPECTED_ACTIONS)
  const unexpectedActions = [...effectiveActions].filter(action => !expectedActions.has(action))
  const missingActions = EXPECTED_ACTIONS.filter(action => !effectiveActions.has(action))
  if (unexpectedActions.length > 0) {
    errors.push(`Unexpected effective actions: ${unexpectedActions.join(', ')}.`)
  }
  if (missingActions.length > 0) {
    errors.push(`Required effective actions are missing: ${missingActions.join(', ')}.`)
  }

  return { valid: errors.length === 0, errors }
}
