import { randomBytes } from 'node:crypto'

import { entitySecretCiphertext } from '../circle.ts'

/**
 * Prints what Circle's console asks for when registering an entity secret.
 *
 * The console wants a *ciphertext*, not the secret, and a ciphertext can only
 * be built from the public key Circle serves to an authenticated caller — so
 * this needs `CIRCLE_API_KEY` and nothing else. Set `CIRCLE_ENTITY_SECRET` to
 * re-encrypt a secret you already hold; leave it unset to have one generated.
 *
 * Whatever it prints is the only copy. Circle keeps none, and a secret lost
 * without its recovery file takes every wallet it backs with it.
 */
const apiKey = process.env.CIRCLE_API_KEY?.trim()
if (!apiKey) {
  console.error('CIRCLE_API_KEY is required — copy it from Circle console first.')
  process.exit(1)
}

const existing = process.env.CIRCLE_ENTITY_SECRET?.trim()
if (existing && !/^[0-9a-fA-F]{64}$/.test(existing)) {
  console.error('CIRCLE_ENTITY_SECRET is set but is not 32 bytes of hex.')
  process.exit(1)
}

const entitySecret = existing || randomBytes(32).toString('hex')
const ciphertext = await entitySecretCiphertext({ apiKey, entitySecret })

if (!existing) {
  console.info('\nGenerated a new entity secret. Put this in .env — it is the only copy:\n')
  console.info(`CIRCLE_ENTITY_SECRET=${entitySecret}\n`)
}

console.info('Paste this into the console\u2019s "Entity Secret Ciphertext" box, then Register:\n')
console.info(ciphertext)
console.info('\nDownload the recovery file on the screen that follows. It is offered once.')
