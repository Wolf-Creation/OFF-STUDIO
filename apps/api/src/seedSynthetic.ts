import { buildSyntheticSeedPlan, generateSyntheticSeedData, syntheticSeedScenarios, validateSyntheticSeedEnvironment } from './syntheticSeed.js'
import { loadRuntimeEnv } from './runtimeConfig.js'

loadRuntimeEnv()

const command = process.argv[2] ?? 'plan'
const plan = buildSyntheticSeedPlan()

function printPlan() {
  console.log(JSON.stringify({ command: 'plan', plan }, null, 2))
}

function printStats() {
  const totals = Object.entries(plan.modelTargets).map(([name, count]) => ({ name, count }))
  console.log(JSON.stringify({ command: 'stats', totals, totalSyntheticDocumentTarget: plan.totalSyntheticDocumentTarget }, null, 2))
}

function printScenarios() {
  console.log(JSON.stringify({ command: 'scenario', scenarios: syntheticSeedScenarios }, null, 2))
}

function printValidation() {
  const result = validateSyntheticSeedEnvironment(process.env)
  console.log(JSON.stringify({ command: 'validate', ok: result.ok, environment: result.verification.environmentName, databaseName: result.verification.databaseName, clusterHost: result.verification.clusterHost, syntheticDataPermission: result.verification.syntheticDataPermission, issues: result.issues }, null, 2))
  if (!result.ok) {
    process.exitCode = 1
  }
}

async function printGenerate() {
  const result = await generateSyntheticSeedData(process.env.SEED_RUN_ID ? { runId: process.env.SEED_RUN_ID } : undefined)
  console.log(JSON.stringify({ command: 'generate', ...result }, null, 2))
}

async function main() {
  switch (command) {
    case 'plan':
      printPlan()
      break
    case 'stats':
      printStats()
      break
    case 'scenario':
      printScenarios()
      break
    case 'validate':
      printValidation()
      break
    case 'generate':
      await printGenerate()
      break
    default:
      console.error(`Unknown seed command: ${command}. Use plan, stats, scenario, validate, or generate.`)
      process.exitCode = 1
  }
}

void main().catch((error) => {
  console.error('Synthetic seed failed:', error instanceof Error ? error.message : 'Unknown error')
  process.exitCode = 1
})
