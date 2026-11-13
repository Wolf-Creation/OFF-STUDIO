import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  getDatabaseVerification,
  getMongoUriDatabaseName,
  isOnlinePaymentEnabled,
  loadRuntimeEnv,
  verifyMongoTarget,
} from '../src/runtimeConfig.js'

const stagingHost = 'off-studio-staging-clus.dxcqee5.mongodb.net'

test('runtime dotenv priority preserves exported values and prefers explicit files over environment files', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'off-runtime-config-'))
  fs.writeFileSync(path.join(directory, '.env'), 'NODE_ENV=staging\nMONGODB_URI=base-uri\nBASE_VALUE=base\n')
  fs.writeFileSync(path.join(directory, '.env.staging'), 'NODE_ENV=staging\nMONGODB_URI=staging-uri\nRUNTIME_VALUE=staging\n')
  fs.writeFileSync(path.join(directory, 'custom.env'), 'MONGODB_URI=explicit-uri\nEXPLICIT_VALUE=custom\n')

  try {
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: 'staging',
      DOTENV_CONFIG_PATH: 'custom.env',
      MONGODB_URI: 'exported-uri',
      EXPORTED_VALUE: 'preserved',
    }

    assert.equal(loadRuntimeEnv(environment, directory), 'custom.env')
    assert.equal(environment.MONGODB_URI, 'exported-uri')
    assert.equal(environment.NODE_ENV, 'staging')
    assert.equal(environment.EXPORTED_VALUE, 'preserved')
    assert.equal(environment.EXPLICIT_VALUE, 'custom')
    assert.equal(environment.RUNTIME_VALUE, 'staging')
    assert.equal(environment.BASE_VALUE, undefined)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('runtime dotenv selection infers NODE_ENV from base config before loading its environment file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'off-runtime-config-'))
  fs.writeFileSync(path.join(directory, '.env'), 'NODE_ENV=staging\nBASE_VALUE=base\n')
  fs.writeFileSync(path.join(directory, '.env.staging'), 'NODE_ENV=staging\nRUNTIME_VALUE=staging\n')

  try {
    const environment: NodeJS.ProcessEnv = {}

    assert.equal(loadRuntimeEnv(environment, directory), '.env.staging')
    assert.equal(environment.NODE_ENV, 'staging')
    assert.equal(environment.RUNTIME_VALUE, 'staging')
    assert.equal(environment.BASE_VALUE, undefined)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('staging verification trusts the database in the URI and requires the exact staging cluster', () => {
  const correctTarget = {
    NODE_ENV: 'staging',
    MONGODB_URI: `mongodb+srv://user:password@${stagingHost}/off_studio_staging`,
  }
  assert.deepEqual(verifyMongoTarget(correctTarget), {
    environmentName: 'staging',
    databaseName: 'off_studio_staging',
    clusterHost: stagingHost,
    verified: true,
  })

  const conflictingDbName = { ...correctTarget, MONGODB_URI: `mongodb+srv://user:password@${stagingHost}/off_studio_production`, MONGODB_DB_NAME: 'off_studio_staging' }
  assert.equal(getMongoUriDatabaseName(conflictingDbName.MONGODB_URI), 'off_studio_production')
  assert.equal(getDatabaseVerification(conflictingDbName).databaseName, 'off_studio_production')
  assert.equal(getDatabaseVerification(conflictingDbName).targetVerified, false)
  assert.throws(() => verifyMongoTarget(conflictingDbName), /does not match/)

  const wrongCluster = { ...correctTarget, MONGODB_URI: 'mongodb+srv://user:password@other-cluster.dxcqee5.mongodb.net/off_studio_staging' }
  assert.throws(() => verifyMongoTarget(wrongCluster), /hostname does not match/)
})

test('connected MongoDB identity is checked against the configured URI target', () => {
  const target = {
    NODE_ENV: 'staging',
    MONGODB_URI: `mongodb+srv://user:password@${stagingHost}/off_studio_staging`,
  }

  assert.throws(
    () => verifyMongoTarget(target, { databaseName: 'off_studio_production', host: 'shard-00-00.dxcqee5.mongodb.net' }),
    /Connected MongoDB database/,
  )
  assert.throws(
    () => verifyMongoTarget(target, { databaseName: 'off_studio_staging', host: 'shard-00-00.other.mongodb.net' }),
    /does not belong/,
  )
  assert.equal(verifyMongoTarget(target, { databaseName: 'off_studio_staging', host: 'shard-00-00.dxcqee5.mongodb.net' }).verified, true)
})

test('test and production require explicitly configured database and cluster targets', () => {
  for (const [environmentName, databaseName] of [['test', 'off_studio_test'], ['production', 'off_studio_prod']]) {
    const wrongDatabase = databaseName === 'off_studio_test' ? 'off_studio_prod' : 'off_studio_test'
    assert.throws(() => verifyMongoTarget({
      NODE_ENV: environmentName,
      MONGODB_URI: `mongodb+srv://user:password@cluster.example.mongodb.net/${wrongDatabase}`,
    }), /must be configured/)

    assert.throws(() => verifyMongoTarget({
      NODE_ENV: environmentName,
      MONGODB_URI: `mongodb+srv://user:password@cluster.example.mongodb.net/${wrongDatabase}`,
      MONGODB_EXPECTED_CLUSTER_HOST: 'cluster.example.mongodb.net',
    }), /database does not match/)

    assert.equal(verifyMongoTarget({
      NODE_ENV: environmentName,
      MONGODB_URI: `mongodb+srv://user:password@${environmentName}-cluster.example.mongodb.net/${databaseName}`,
      MONGODB_EXPECTED_CLUSTER_HOST: `${environmentName}-cluster.example.mongodb.net`,
    }).verified, true)
  }
})

test('online payments are disabled unless explicitly enabled', () => {
  assert.equal(isOnlinePaymentEnabled({}), false)
  assert.equal(isOnlinePaymentEnabled({ ONLINE_PAYMENT_ENABLED: 'false' }), false)
  assert.equal(isOnlinePaymentEnabled({ ONLINE_PAYMENT_ENABLED: 'true' }), true)
  assert.equal(isOnlinePaymentEnabled({ ONLINE_PAYMENT_ENABLED: '1' }), true)
})

test('development health does not label an unpinned MongoDB target as verified', () => {
  const verification = getDatabaseVerification({
    NODE_ENV: 'development',
    MONGODB_URI: 'mongodb+srv://user:password@dev-cluster.example.mongodb.net/dev_db',
  })

  assert.equal(verification.databaseName, 'dev_db')
  assert.equal(verification.targetVerified, false)
})
