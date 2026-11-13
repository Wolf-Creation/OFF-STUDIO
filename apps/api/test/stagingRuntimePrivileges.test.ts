import assert from 'node:assert/strict'
import test from 'node:test'
import { validateStagingRuntimePrivileges, type StagingPrivilegeStatus } from '../src/stagingRuntimePrivileges.js'

const expectedActions = ['find', 'insert', 'update', 'remove', 'createCollection', 'createIndex']

function validStatus(overrides: Partial<StagingPrivilegeStatus['authInfo']> = {}): StagingPrivilegeStatus {
  return {
    authInfo: {
      authenticatedUsers: [{ user: 'off_studio_staging_app', db: 'admin' }],
      authenticatedUserRoles: [{ role: 'offStudioStagingRuntime', db: 'admin' }],
      authenticatedUserPrivileges: [{
        resource: { db: 'off_studio_staging', collection: '' },
        actions: expectedActions,
      }],
      ...overrides,
    },
  }
}

test('accepts the runtime user, role, staging resource, and exactly six expected actions', () => {
  assert.deepEqual(validateStagingRuntimePrivileges(validStatus()), { valid: true, errors: [] })
})

test('rejects the previous role name', () => {
  const result = validateStagingRuntimePrivileges(validStatus({
    authenticatedUserRoles: [{ role: 'offStudioStagingReadWrite', db: 'admin' }],
  }))

  assert.equal(result.valid, false)
  assert.match(result.errors.join(' '), /roles do not exactly match/)
})

test('rejects an additional effective action', () => {
  const result = validateStagingRuntimePrivileges(validStatus({
    authenticatedUserPrivileges: [{
      resource: { db: 'off_studio_staging', collection: '' },
      actions: [...expectedActions, 'dropCollection'],
    }],
  }))

  assert.equal(result.valid, false)
  assert.match(result.errors.join(' '), /Unexpected effective actions: dropCollection/)
})

test('rejects a global resource', () => {
  const result = validateStagingRuntimePrivileges(validStatus({
    authenticatedUserPrivileges: [{
      resource: { db: '', collection: '', anyResource: true },
      actions: expectedActions,
    }],
  }))

  assert.equal(result.valid, false)
  assert.match(result.errors.join(' '), /not scoped to all collections/)
})

test('rejects a resource in another database', () => {
  const result = validateStagingRuntimePrivileges(validStatus({
    authenticatedUserPrivileges: [{
      resource: { db: 'admin', collection: '' },
      actions: expectedActions,
    }],
  }))

  assert.equal(result.valid, false)
  assert.match(result.errors.join(' '), /not scoped to all collections/)
})

test('rejects a collection-specific resource', () => {
  const result = validateStagingRuntimePrivileges(validStatus({
    authenticatedUserPrivileges: [{
      resource: { db: 'off_studio_staging', collection: 'products' },
      actions: expectedActions,
    }],
  }))

  assert.equal(result.valid, false)
  assert.match(result.errors.join(' '), /not scoped to all collections/)
})

test('rejects an unexpected authenticated user', () => {
  const result = validateStagingRuntimePrivileges(validStatus({
    authenticatedUsers: [{ user: 'off_studio_staging_user', db: 'admin' }],
  }))

  assert.equal(result.valid, false)
  assert.match(result.errors.join(' '), /Authenticated user does not exactly match/)
})

test('rejects additional inherited roles', () => {
  const result = validateStagingRuntimePrivileges(validStatus({
    authenticatedUserRoles: [
      { role: 'offStudioStagingRuntime', db: 'admin' },
      { role: 'readWriteAnyDatabase', db: 'admin' },
    ],
  }))

  assert.equal(result.valid, false)
  assert.match(result.errors.join(' '), /roles do not exactly match/)
})
