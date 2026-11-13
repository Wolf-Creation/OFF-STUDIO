import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

const EXPECTED_STAGING_DB = 'off_studio_staging'
const EXPECTED_STAGING_CLUSTER = 'off-studio-staging'
const EXPECTED_DATABASES: Record<string, string> = {
  test: 'off_studio_test',
  staging: EXPECTED_STAGING_DB,
  production: 'off_studio_prod',
}

export function isOnlinePaymentEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return ['true', '1', 'yes', 'on'].includes(env.ONLINE_PAYMENT_ENABLED?.trim().toLowerCase() ?? '')
}

export function loadRuntimeEnv(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string | null {
  const requested = env.DOTENV_CONFIG_PATH
  const explicitPath = requested ? path.resolve(cwd, requested) : null
  const basePath = path.resolve(cwd, '.env')
  const explicitValues = explicitPath && fs.existsSync(explicitPath)
    ? dotenv.parse(fs.readFileSync(explicitPath))
    : {}
  const baseValues = fs.existsSync(basePath) ? dotenv.parse(fs.readFileSync(basePath)) : {}
  const runtimeName = (env.NODE_ENV ?? explicitValues.NODE_ENV ?? baseValues.NODE_ENV ?? 'development').trim().toLowerCase()
  const candidates = [
    explicitPath,
    runtimeName === 'development' ? null : path.resolve(cwd, `.env.${runtimeName}`),
    runtimeName === 'development' ? basePath : null,
  ].filter((candidate): candidate is string => candidate !== null)
  const uniqueCandidates = [...new Set(candidates)]
  let loaded: string | null = null

  for (const candidate of uniqueCandidates) {
    if (!fs.existsSync(candidate)) continue
    const values = dotenv.parse(fs.readFileSync(candidate))
    for (const [key, value] of Object.entries(values)) {
      if (env[key] === undefined) env[key] = value
    }
    if (!loaded) loaded = candidate === explicitPath ? requested ?? candidate : path.relative(cwd, candidate)
  }

  return loaded
}

export function normalizeMongoUri(uri: string): string {
  const trimmed = uri.trim()
  if (!trimmed) return trimmed

  const schemeMatch = trimmed.match(/^((?:mongodb|mongodb\+srv):\/\/)/i)
  if (!schemeMatch) return trimmed

  const authStart = trimmed.indexOf('://') + 3
  const authEnd = trimmed.lastIndexOf('@')
  if (authEnd <= authStart) return trimmed

  const prefix = trimmed.slice(0, authStart)
  const credentials = trimmed.slice(authStart, authEnd)
  const suffix = trimmed.slice(authEnd + 1)
  const separatorIndex = credentials.indexOf(':')

  let username = credentials
  let password = ''
  if (separatorIndex !== -1) {
    username = credentials.slice(0, separatorIndex)
    password = credentials.slice(separatorIndex + 1)
  }

  const normalizedCredentials = `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ''}`
  return `${prefix}${normalizedCredentials}@${suffix}`
}

export function getMongoUriDatabaseName(uri: string): string {
  try {
    const parsed = new URL(normalizeMongoUri(uri))
    const dbName = parsed.pathname.replace(/^\/+/, '').split('/')[0]
    return dbName ?? ''
  } catch {
    return ''
  }
}

export function getMongoUriHostName(uri: string): string {
  try {
    return new URL(normalizeMongoUri(uri)).hostname
  } catch {
    return ''
  }
}

function expectedDatabaseName(environmentName: string, env: NodeJS.ProcessEnv): string {
  return EXPECTED_DATABASES[environmentName] ?? env.MONGODB_EXPECTED_DB_NAME?.trim() ?? ''
}

function expectedClusterHost(environmentName: string, env: NodeJS.ProcessEnv): string {
  if (environmentName === 'staging') return 'off-studio-staging-clus.dxcqee5.mongodb.net'
  return env.MONGODB_EXPECTED_CLUSTER_HOST?.trim() ?? ''
}

function sameAtlasCluster(expectedHost: string, actualHost: string): boolean {
  const expectedSuffix = expectedHost.toLowerCase().split('.').slice(-3).join('.')
  const actualSuffix = actualHost.toLowerCase().split('.').slice(-3).join('.')
  return expectedSuffix.length > 0 && expectedSuffix === actualSuffix
}

export function verifyMongoTarget(
  env: NodeJS.ProcessEnv = process.env,
  actual?: { databaseName?: string; host?: string },
) {
  const environmentName = (env.NODE_ENV ?? 'development').trim().toLowerCase()
  if (environmentName === 'development') {
    const databaseName = getMongoUriDatabaseName(env.MONGODB_URI ?? '')
    const clusterHost = getMongoUriHostName(env.MONGODB_URI ?? '')
    const expectedDbName = env.MONGODB_EXPECTED_DB_NAME?.trim() ?? ''
    const expectedHost = env.MONGODB_EXPECTED_CLUSTER_HOST?.trim() ?? ''
    if (env.MONGODB_DB_NAME && databaseName && env.MONGODB_DB_NAME !== databaseName) {
      throw new Error('MONGODB_DB_NAME does not match the database name in MONGODB_URI.')
    }
    if (Boolean(expectedDbName) !== Boolean(expectedHost)) {
      throw new Error('MONGODB_EXPECTED_DB_NAME and MONGODB_EXPECTED_CLUSTER_HOST must be configured together.')
    }
    if (expectedDbName && databaseName !== expectedDbName) {
      throw new Error('MongoDB URI database does not match the explicitly expected database.')
    }
    if (expectedHost && clusterHost.toLowerCase() !== expectedHost.toLowerCase()) {
      throw new Error('MongoDB URI hostname does not match the expected cluster hostname.')
    }
    if (actual?.databaseName && databaseName && actual.databaseName !== databaseName) {
      throw new Error('Connected MongoDB database does not match the database name in MONGODB_URI.')
    }
    if (actual?.host && clusterHost && !sameAtlasCluster(clusterHost, actual.host)) {
      throw new Error('Connected MongoDB host does not belong to the configured MongoDB target.')
    }
    return { environmentName, databaseName, clusterHost, verified: Boolean(expectedDbName && expectedHost) }
  }
  if (!['test', 'staging', 'production'].includes(environmentName)) {
    throw new Error('MongoDB target cannot be verified for the configured runtime environment.')
  }

  const uri = env.MONGODB_URI ?? ''
  const databaseName = getMongoUriDatabaseName(uri)
  const clusterHost = getMongoUriHostName(uri)
  const expectedDbName = expectedDatabaseName(environmentName, env)
  const expectedHost = expectedClusterHost(environmentName, env)

  if (!databaseName || !clusterHost) throw new Error('MONGODB_URI must include a database name and cluster hostname.')
  if (!expectedDbName || !expectedHost) {
    throw new Error('MONGODB_EXPECTED_DB_NAME and MONGODB_EXPECTED_CLUSTER_HOST must be configured for this environment.')
  }
  if (databaseName !== expectedDbName) throw new Error('MongoDB URI database does not match the explicitly expected database.')
  if (env.MONGODB_DB_NAME && env.MONGODB_DB_NAME !== databaseName) {
    throw new Error('MONGODB_DB_NAME does not match the database name in MONGODB_URI.')
  }
  if (clusterHost.toLowerCase() !== expectedHost.toLowerCase()) {
    throw new Error('MongoDB URI hostname does not match the expected cluster hostname.')
  }
  if (actual?.databaseName && actual.databaseName !== databaseName) {
    throw new Error('Connected MongoDB database does not match the database name in MONGODB_URI.')
  }
  if (actual?.host && !sameAtlasCluster(clusterHost, actual.host)) {
    throw new Error('Connected MongoDB host does not belong to the expected Atlas cluster.')
  }

  return { environmentName, databaseName, clusterHost, verified: true }
}

export function getSyntheticDataPermissionStatus(env: NodeJS.ProcessEnv = process.env): boolean {
  const currentEnvironment = (env.NODE_ENV ?? 'development').toLowerCase()
  const uriDatabaseName = getMongoUriDatabaseName(env.MONGODB_URI ?? '')
  const databaseName = uriDatabaseName || env.MONGODB_DB_NAME || ''
  const allowSyntheticData = env.ALLOW_SYNTHETIC_DATA?.trim().toLowerCase() === 'true'
  let targetVerified = false
  try {
    verifyMongoTarget(env)
    targetVerified = true
  } catch {
    targetVerified = false
  }

  return currentEnvironment === 'staging'
    && allowSyntheticData
    && targetVerified
    && (!env.MONGODB_DB_NAME || env.MONGODB_DB_NAME === uriDatabaseName)
    && databaseName === EXPECTED_STAGING_DB
    && getMongoUriHostName(env.MONGODB_URI ?? '').toLowerCase().includes(EXPECTED_STAGING_CLUSTER)
}

export function getDatabaseVerification(env: NodeJS.ProcessEnv = process.env) {
  const environmentName = (env.NODE_ENV ?? 'development').toLowerCase()
  const uriDatabaseName = getMongoUriDatabaseName(env.MONGODB_URI ?? '')
  const databaseName = uriDatabaseName || env.MONGODB_DB_NAME || ''
  const clusterHost = getMongoUriHostName(env.MONGODB_URI ?? '')
  const syntheticDataPermission = getSyntheticDataPermissionStatus(env)
  let targetVerified = false
  try {
    targetVerified = verifyMongoTarget(env).verified
  } catch {
    targetVerified = false
  }

  return {
    environmentName,
    databaseName,
    clusterHost,
    targetVerified,
    syntheticDataPermission,
    isStaging: environmentName === 'staging',
    isProduction: environmentName === 'production',
  }
}

export function assertVerifiedStagingSeed(env: NodeJS.ProcessEnv = process.env) {
  const verification = getDatabaseVerification(env)

  if (verification.environmentName === 'production') {
    throw new Error('Synthetic seed data is blocked in production.')
  }

  if (verification.environmentName !== 'staging') {
    return verification
  }

  if (!verification.syntheticDataPermission) {
    throw new Error('Synthetic seed data is blocked until the target database is explicitly verified as the staging database and ALLOW_SYNTHETIC_DATA=true.')
  }

  return verification
}
