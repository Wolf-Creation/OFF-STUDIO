import mongoose from 'mongoose'
import { getDatabaseVerification, loadRuntimeEnv, normalizeMongoUri, verifyMongoTarget } from './runtimeConfig.js'
import { validateStagingRuntimePrivileges, type StagingPrivilegeStatus } from './stagingRuntimePrivileges.js'

const EXPECTED_STAGING_USERNAME = 'off_studio_staging_app'
const EXPECTED_STAGING_DATABASE = 'off_studio_staging'
const EXPECTED_STAGING_HOST = 'off-studio-staging-clus.dxcqee5.mongodb.net'
const EXPECTED_STAGING_ROLE = 'offStudioStagingRuntime'

async function main() {
  const loadedFile = loadRuntimeEnv()
  const verification = getDatabaseVerification(process.env)
  const mongoUri = process.env.MONGODB_URI ? normalizeMongoUri(process.env.MONGODB_URI) : ''
  const parsedUri = mongoUri ? new URL(mongoUri) : null
  const username = parsedUri ? decodeURIComponent(parsedUri.username) : ''
  const authSource = parsedUri?.searchParams.get('authSource') ?? ''

  console.log(`Environment name: ${verification.environmentName}`)
  console.log(`Dotenv file loaded: ${loadedFile ?? 'none'}`)
  console.log(`MongoDB username: ${username || 'not configured'}`)
  console.log(`Configured database: ${verification.databaseName || 'not configured'}`)
  console.log(`Configured hostname: ${verification.clusterHost || 'not configured'}`)
  console.log(`Authentication source: ${authSource || 'not configured'}`)

  const configMatches = loadedFile === '.env.staging'
    && verification.environmentName === 'staging'
    && username === EXPECTED_STAGING_USERNAME
    && process.env.MONGODB_DB_NAME === EXPECTED_STAGING_DATABASE
    && verification.databaseName === EXPECTED_STAGING_DATABASE
    && authSource === 'admin'
    && verification.clusterHost === EXPECTED_STAGING_HOST
  if (!mongoUri || !configMatches) {
    console.error('Configuration verification failed; MongoDB connection was not attempted.')
    process.exitCode = 1
    return
  }

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 })
    const actualDatabase = mongoose.connection.name
    const actualHost = mongoose.connection.host
    verifyMongoTarget(process.env, { databaseName: actualDatabase, host: actualHost })
    if (actualDatabase !== EXPECTED_STAGING_DATABASE) {
      throw new Error('Connected MongoDB database does not match the verified staging database.')
    }

    const db = mongoose.connection.db
    if (!db) throw new Error('MongoDB database handle was unavailable after connecting.')
    const product = await db.collection('products').findOne({}, { projection: { _id: 1 } })

    console.log(`Authentication status: ${mongoose.connection.readyState === 1 ? 'successful' : 'failed'}`)
    console.log(`Connected database name: ${actualDatabase}`)
    console.log(`Connected hostname: ${actualHost}`)
    console.log(`Read access status: successful (products document ${product ? 'found' : 'not found'})`)

    const status = await db.command({ connectionStatus: 1, showPrivileges: true })
    const validation = validateStagingRuntimePrivileges(status as StagingPrivilegeStatus)
    console.log(`Expected custom role (${EXPECTED_STAGING_ROLE}) and exact effective privileges: ${validation.valid ? 'passed' : 'failed'}`)
    if (!validation.valid) {
      console.error(`Privilege validation errors: ${validation.errors.join(' ')}`)
      process.exitCode = 1
    }
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'Error'
    const errorCode = typeof error === 'object' && error !== null && 'code' in error
      ? ` (code ${String(error.code)})`
      : ''
    console.error(`MongoDB connection, read, or privilege verification failed: ${errorName}${errorCode}. Error details omitted to protect credentials.`)
    process.exitCode = 1
  } finally {
    await mongoose.disconnect().catch(() => undefined)
  }
}

void main()
