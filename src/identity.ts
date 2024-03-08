import { fetchConfig } from '@acala-network/chopsticks'
import { setupNetworks, testingPairs } from '@acala-network/chopsticks-testing'
import { compactAddLength } from '@polkadot/util'

const main = async () => {
  const { polkadot, collectives } = await setupNetworks({
    polkadot: {
      ...(await fetchConfig('polkadot')),
      db: './db.sqlite',
      block: 16465797,
      port: 8000,
      'wasm-override': './polkadot_runtime.compact.compressed.wasm',
      'runtime-log-level': 5,
    },
    collectives: {
      ...(await fetchConfig('polkadot-collectives')),
      db: './db.sqlite',
      // block: 1704428,
      port: 8001,
    },
  })

  const { alice } = testingPairs('sr25519')

  const fellowsAccount = '12fkTMnd48kJV9nZF2zLpSbM6DnKQ8JhW2jhhQgArY4i1Ag'

  await polkadot.dev.setStorage({
    scheduler: {
      agenda: [
        [
          [polkadot.chain.head.number + 2],
          [
            {
              priority: 128,
              call: {
                Inline: polkadot.api.tx.identity
                  .addRegistrar(fellowsAccount)
                  .method.toHex(true),
              },
              maybePeriodic: null,
              origin: { system: 'Root' },
            },
          ],
        ],
      ],
    },
  })

  await polkadot.dev.newBlock({ count: 3 })

  const identity = polkadot.api.createType('PalletIdentityIdentityInfo', {
    display: { Raw: 'Alice' },
    email: { Raw: 'alice@example.com' },
  })

  await polkadot.api.tx.identity.setIdentity(identity).signAndSend(alice)

  await collectives.dev.setStorage({
    scheduler: {
      agenda: [
        [
          [collectives.chain.head.number + 2],
          [
            {
              priority: 128,
              call: {
                Inline: collectives.api.tx.polkadotXcm
                  .send(
                    { v3: { parents: 1, interior: 'here' } },
                    {
                      v3: [
                        {
                          UnpaidExecution: {
                            weightLimit: 'Unlimited',
                            checkOrigin: null,
                          },
                        },
                        {
                          Transact: {
                            originKind: 'SovereignAccount',
                            requireWeightAtMost: {
                              refTime: 1000000000n,
                              proofSize: 1048576,
                            },
                            call: compactAddLength(
                              polkadot.api.tx.identity
                                .provideJudgement(
                                  4,
                                  alice.address,
                                  'KnownGood',
                                  identity.hash
                                )
                                .method.toU8a()
                            ),
                          },
                        },
                      ],
                    }
                  )
                  .method.toHex(true),
              },
              maybePeriodic: null,
              origin: { FellowshipOrigins: 'Fellows' },
            },
          ],
        ],
      ],
    },
  })

  await collectives.dev.newBlock({ count: 3 })
}

main().catch(console.error)
