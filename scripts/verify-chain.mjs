#!/usr/bin/env node
/**
 * Arc testnet chain probe.
 *
 * Answers the one question the rest of the codebase branches on:
 * is a USDC tip a NATIVE value transfer, or an ERC-20 transfer() call?
 *
 * On Arc, USDC is the native gas token. That does not by itself tell us
 * whether an ERC-20 USDC also exists (as ETH and WETH coexist), nor how
 * many decimals the native currency uses — EVM natives conventionally use
 * 18, but a USDC-denominated chain might use 6. Guessing either wrong
 * corrupts every amount in the product, so we measure instead.
 *
 * Zero dependencies: runs before `npm install`.
 *
 *   node scripts/verify-chain.mjs
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ── .env loading ────────────────────────────────────────────────────────────
// Hand-rolled rather than process.loadEnvFile() so this works on any Node 18+.

function loadEnv() {
  const env = { ...process.env }
  try {
    const raw = readFileSync(resolve(ROOT, '.env'), 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (value && env[key] === undefined) env[key] = value
    }
  } catch {
    // No .env — fall back to real environment variables only.
  }
  return env
}

// ── output helpers ──────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
}

const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (color, s) => (supportsColor ? `${color}${s}${C.reset}` : String(s))

const section = (title) => console.log(`\n${paint(C.bold, title)}\n${'─'.repeat(title.length)}`)
const row = (label, value) => console.log(`  ${label.padEnd(26)} ${value}`)
const note = (s) => console.log(`  ${paint(C.dim, s)}`)
const warn = (s) => console.log(`  ${paint(C.yellow, '! ' + s)}`)
const fail = (s) => console.log(`  ${paint(C.red, 'x ' + s)}`)
const ok = (s) => console.log(`  ${paint(C.green, '+ ' + s)}`)

// ── JSON-RPC ────────────────────────────────────────────────────────────────

let rpcId = 0

async function rpc(url, method, params = []) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  })
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status} ${res.statusText}`)
  const body = await res.json()
  if (body.error) throw new Error(`${method}: ${body.error.message ?? JSON.stringify(body.error)}`)
  return body.result
}

/** Calls that are allowed to fail — returns null instead of throwing. */
async function tryRpc(url, method, params = []) {
  try {
    return await rpc(url, method, params)
  } catch {
    return null
  }
}

// ── minimal ABI encode/decode ───────────────────────────────────────────────

const SELECTOR = {
  name: '0x06fdde03',
  symbol: '0x95d89b41',
  decimals: '0x313ce567',
  totalSupply: '0x18160ddd',
  balanceOf: '0x70a08231',
  transfer: '0xa9059cbb',
}

const pad32 = (hexNo0x) => hexNo0x.padStart(64, '0')
const encodeAddress = (addr) => pad32(addr.toLowerCase().replace(/^0x/, ''))
const encodeUint = (value) => pad32(BigInt(value).toString(16))

const hexToBigInt = (hex) => (hex && hex !== '0x' ? BigInt(hex) : null)

/** Decodes an ABI-encoded `string` return, tolerating old bytes32-style tokens. */
function decodeString(hex) {
  if (!hex || hex === '0x') return null
  const data = hex.replace(/^0x/, '')
  // Dynamic string: [offset][length][bytes...]
  if (data.length >= 128) {
    const offset = Number(BigInt('0x' + data.slice(0, 64))) * 2
    const lenSlice = data.slice(offset, offset + 64)
    if (lenSlice) {
      const len = Number(BigInt('0x' + lenSlice)) * 2
      const bytes = data.slice(offset + 64, offset + 64 + len)
      const decoded = Buffer.from(bytes, 'hex').toString('utf8').replace(/\0/g, '')
      if (decoded) return decoded
    }
  }
  // bytes32 fallback
  const decoded = Buffer.from(data.slice(0, 64), 'hex').toString('utf8').replace(/\0/g, '')
  return decoded.trim() || null
}

/** Renders a raw integer balance at a given decimal precision. */
function format(raw, decimals) {
  const d = BigInt(10) ** BigInt(decimals)
  const whole = raw / d
  const frac = (raw % d).toString().padStart(decimals, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}

// ── probe ───────────────────────────────────────────────────────────────────

async function main() {
  const env = loadEnv()
  const rpcUrl = env.ARC_RPC_URL

  console.log(paint(C.bold, '\nTipee — Arc testnet probe'))

  if (!rpcUrl) {
    section('Missing configuration')
    fail('ARC_RPC_URL is not set.')
    note('Copy .env.example to .env and fill in ARC_RPC_URL, then re-run.')
    process.exitCode = 1
    return
  }

  note(`RPC: ${rpcUrl}`)

  // ── identity ──────────────────────────────────────────────────────────────
  section('Chain identity')

  let chainId
  try {
    chainId = Number(BigInt(await rpc(rpcUrl, 'eth_chainId')))
    row('chain id', paint(C.cyan, chainId))
  } catch (err) {
    fail(`Could not reach the RPC: ${err.message}`)
    note('Check ARC_RPC_URL, and whether the endpoint needs an API key.')
    process.exitCode = 1
    return
  }

  if (env.ARC_CHAIN_ID) {
    const expected = Number(env.ARC_CHAIN_ID)
    if (expected === chainId) ok(`matches ARC_CHAIN_ID (${expected})`)
    else warn(`ARC_CHAIN_ID says ${expected}, but the RPC reports ${chainId}. Trust the RPC.`)
  } else {
    note('ARC_CHAIN_ID not set — record the value above in .env.')
  }

  const clientVersion = await tryRpc(rpcUrl, 'web3_clientVersion')
  if (clientVersion) row('client', clientVersion)

  const blockNumber = hexToBigInt(await tryRpc(rpcUrl, 'eth_blockNumber'))
  if (blockNumber !== null) row('block height', blockNumber.toString())

  // ── fee market ────────────────────────────────────────────────────────────
  section('Fee market')

  const block = await tryRpc(rpcUrl, 'eth_getBlockByNumber', ['latest', false])
  const baseFee = block?.baseFeePerGas ? BigInt(block.baseFeePerGas) : null
  const eip1559 = baseFee !== null

  if (eip1559) {
    ok('EIP-1559 (baseFeePerGas present)')
    row('base fee', `${baseFee} wei`)
  } else {
    warn('No baseFeePerGas — looks like a legacy gasPrice chain.')
  }

  const gasPrice = hexToBigInt(await tryRpc(rpcUrl, 'eth_gasPrice'))
  if (gasPrice !== null) row('eth_gasPrice', `${gasPrice} wei`)

  const priceForEstimate = baseFee ?? gasPrice ?? 0n
  note(eip1559 ? 'Configure viem for EIP-1559 fees.' : 'Configure viem for legacy gasPrice.')

  // ── native currency ───────────────────────────────────────────────────────
  section('Native currency')

  const probeAddress = env.PROBE_ADDRESS
  let nativeBalance = null

  if (probeAddress) {
    nativeBalance = hexToBigInt(await tryRpc(rpcUrl, 'eth_getBalance', [probeAddress, 'latest']))
  }

  if (nativeBalance === null) {
    warn('No PROBE_ADDRESS balance available.')
    note('Set PROBE_ADDRESS to a funded testnet address to pin down native decimals.')
  } else if (nativeBalance === 0n) {
    warn(`${probeAddress} holds 0. Fund it from the faucet, then re-run.`)
    note('A non-zero balance is what reveals whether the native token uses 6 or 18 decimals.')
  } else {
    row('raw balance', nativeBalance.toString())
    console.log()
    note('Which reading matches what the faucet actually gave you?')
    row('  as 6 decimals', paint(C.cyan, format(nativeBalance, 6)))
    row('  as 18 decimals', paint(C.cyan, format(nativeBalance, 18)))
    console.log()
    note('Record the correct one as NATIVE_DECIMALS. Every amount in the app depends on it.')
  }

  // ── ERC-20 USDC, if any ───────────────────────────────────────────────────
  section('ERC-20 USDC')

  const usdcAddress = env.USDC_ADDRESS?.trim()
  let erc20 = null

  if (!usdcAddress) {
    note('USDC_ADDRESS not set — skipping.')
    note('If Arc exposes an ERC-20 USDC alongside the native token, set it and re-run.')
  } else {
    const code = await tryRpc(rpcUrl, 'eth_getCode', [usdcAddress, 'latest'])
    if (!code || code === '0x') {
      fail(`No contract deployed at ${usdcAddress}.`)
      note('Either the address is wrong, or USDC on Arc is native-only.')
    } else {
      ok(`Contract present at ${usdcAddress}`)

      const [symbolHex, nameHex, decimalsHex, supplyHex] = await Promise.all([
        tryRpc(rpcUrl, 'eth_call', [{ to: usdcAddress, data: SELECTOR.symbol }, 'latest']),
        tryRpc(rpcUrl, 'eth_call', [{ to: usdcAddress, data: SELECTOR.name }, 'latest']),
        tryRpc(rpcUrl, 'eth_call', [{ to: usdcAddress, data: SELECTOR.decimals }, 'latest']),
        tryRpc(rpcUrl, 'eth_call', [{ to: usdcAddress, data: SELECTOR.totalSupply }, 'latest']),
      ])

      const symbol = decodeString(symbolHex)
      const name = decodeString(nameHex)
      const decimals = hexToBigInt(decimalsHex)
      const supply = hexToBigInt(supplyHex)

      if (symbol) row('symbol', symbol)
      if (name) row('name', name)
      if (decimals !== null) row('decimals', paint(C.cyan, decimals.toString()))
      if (supply !== null && decimals !== null) {
        row('total supply', format(supply, Number(decimals)))
      }

      if (decimals !== null && decimals !== 6n) {
        warn(`decimals is ${decimals}, not the usual 6 for USDC. Do not assume 6 anywhere.`)
      }

      if (probeAddress) {
        const balHex = await tryRpc(rpcUrl, 'eth_call', [
          { to: usdcAddress, data: SELECTOR.balanceOf + encodeAddress(probeAddress) },
          'latest',
        ])
        const bal = hexToBigInt(balHex)
        if (bal !== null && decimals !== null) {
          row('probe balance', `${format(bal, Number(decimals))} ${symbol ?? ''}`.trim())
        }
      }

      erc20 = { symbol, decimals }
    }
  }

  // ── gas estimates for both transfer shapes ────────────────────────────────
  section('Transfer cost')

  const nativeDecimalsGuess = 18
  const showCost = (gasUnits) => {
    if (priceForEstimate === 0n) return 'gas price unknown'
    const wei = gasUnits * priceForEstimate
    return `${gasUnits} gas  ~=  ${format(wei, 6)} (if native is 6dp) / ${format(wei, nativeDecimalsGuess)} (if 18dp)`
  }

  if (!probeAddress) {
    warn('No PROBE_ADDRESS — cannot produce live gas estimates.')
    note('Typical values: ~21,000 for a native transfer, ~50,000-65,000 for an ERC-20 transfer.')
  } else {
    // Native: send 1 wei to self. Costs nothing, and reveals the real gas floor.
    const nativeGas = hexToBigInt(
      await tryRpc(rpcUrl, 'eth_estimateGas', [
        { from: probeAddress, to: probeAddress, value: '0x1' },
      ]),
    )
    if (nativeGas !== null) {
      row('native transfer', showCost(nativeGas))
    } else {
      warn('Native transfer estimate failed (probe address may be unfunded).')
    }

    if (usdcAddress && erc20) {
      const data = SELECTOR.transfer + encodeAddress(probeAddress) + encodeUint(1)
      const erc20Gas = hexToBigInt(
        await tryRpc(rpcUrl, 'eth_estimateGas', [
          { from: probeAddress, to: usdcAddress, data },
        ]),
      )
      if (erc20Gas !== null) row('ERC-20 transfer', showCost(erc20Gas))
      else warn('ERC-20 transfer estimate failed (needs a non-zero token balance).')
    }
  }

  // ── verdict ───────────────────────────────────────────────────────────────
  section('Verdict')

  if (erc20) {
    console.log('  Both a native token and an ERC-20 USDC exist on this chain.')
    console.log(`  ${paint(C.bold, 'Decide deliberately')} which one a tip moves:`)
    note('- native transfer: cheaper, simpler, no allowance or contract risk')
    note('- ERC-20 transfer: only if creators/Circle expect the token contract')
    console.log()
    console.log(`  Implement the choice in ${paint(C.cyan, 'packages/extension/src/wallet/chain.ts')}.`)
    console.log('  Confirm which one Circle credits to a dev-controlled wallet before deciding —')
    console.log('  a tip Circle cannot see is a tip the creator can never withdraw.')
  } else if (usdcAddress) {
    console.log('  No working ERC-20 found at USDC_ADDRESS.')
    console.log(`  ${paint(C.bold, 'A tip is a NATIVE value transfer.')}`)
  } else {
    console.log('  No ERC-20 address configured, so on the evidence here:')
    console.log(`  ${paint(C.bold, 'a tip is a NATIVE value transfer.')}`)
    note('Set USDC_ADDRESS and re-run if you learn a token contract also exists.')
  }

  console.log()
  console.log(`  ${paint(C.bold, 'Record before writing chain code:')}`)
  note('1. NATIVE_DECIMALS — 6 or 18, from the balance readings above')
  note('2. Transfer shape — native value, or ERC-20 transfer()')
  note('3. Fee market — EIP-1559 or legacy gasPrice')
  console.log()
}

main().catch((err) => {
  console.error(`\n${paint(C.red, 'Probe failed:')} ${err.message}\n`)
  process.exitCode = 1
})
