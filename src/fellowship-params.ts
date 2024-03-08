import { fetchConfig, BuildBlockMode } from '@acala-network/chopsticks'
import {
  setupNetworks,
  signFakeWithApi,
} from '@acala-network/chopsticks-testing'
import { compactAddLength, u8aToHex } from '@polkadot/util'

// test the correct parameter will make the correct payout amount
const main = async () => {
  const { assetHub, collectives } = await setupNetworks({
    assetHub: {
      ...(await fetchConfig('polkadot-asset-hub')),
      db: './db.sqlite',
      block: 5808745,
      port: 8000,
      'build-block-mode': BuildBlockMode.Manual,
    },
    collectives: {
      ...(await fetchConfig('polkadot-collectives')),
      db: './db.sqlite',
      block: 3346308,
      port: 8001,
      'build-block-mode': BuildBlockMode.Manual,
    },
  })

  const { api, dev } = collectives

  const account = '14DsLzVyTUTDMm2eP3czwPbH53KgqnQRp3CJJZS9GR7yxGDP' // Bryan account
  const preimage =
    '0x3f0155a8ab31000000000000000000000000aa505763000000000000000000000000aa425d8d01000000000000000000000000e40b540200000000000000000000005585ba1a030000000000000000000000aa2669e1030000000000000000000000aa2669e1030000000000000000000000aa2669e1030000000000000000000000aa2669e10300000000000000000000002ad4d51800000000000000000000000055a8ab3100000000000000000000000055a1aec600000000000000000000000000f2052a010000000000000000000000aa425d8d0100000000000000000000005593b4f00100000000000000000000005593b4f00100000000000000000000005593b4f00100000000000000000000005593b4f00100000000000000000000002a080a002a080a005410140054101400541014005410140000000000000000000000000000000000a8202800a8202800a8202800a8202800a8202800a820280054101400201a2000a8202800' // update to the correct parameter


  console.log('Update parameter')

  const decoded = api.registry.createType('Call', preimage)
  const preimageHash = decoded.hash.toHex()
  const len = decoded.encodedLength

  console.log('Call:', decoded.toHuman())
  console.log('CallHash:', preimageHash)

  const blockNumber = (await api.query.system.number()).toNumber()

  await dev.setStorage({
    preimage: {
      preimageFor: [
        [
          [[preimageHash, decoded.encodedLength]],
          u8aToHex(compactAddLength(decoded.toU8a())),
        ],
      ],
    },
    scheduler: {
      agenda: [
        [
          [blockNumber + 1],
          [
            {
              call: {
                Lookup: {
                  hash: preimageHash,
                  len,
                },
              },
              origin: {
                fellowshipOrigins: 'Fellows',
              },
            },
          ],
        ],
      ],
    },
  })

  await newBlock(collectives)

  console.log('Jump to next cycle')

  const nextCycleStartish = blockNumber + 15 * 86400 / 12 // 15 days later

  await newBlock(collectives, { count: 1, unsafeBlockHeight: nextCycleStartish })

  console.log('Bump cycle')

  const bumpTx = api.tx.fellowshipSalary.bump()
  await signFakeWithApi(api, bumpTx, account)
  await bumpTx.send()

  await newBlock(collectives)

  console.log('Register for payout')

  const registerTx = api.tx.fellowshipSalary.register()
  await signFakeWithApi(api, registerTx, account)
  await registerTx.send()

  await newBlock(collectives)

  console.log('Fast forward past the register period')

  const nextPayoutStartish = nextCycleStartish + 15 * 86400 / 12  // 15 days later

  await newBlock(collectives, { count: 1, unsafeBlockHeight: nextPayoutStartish })

  console.log('Make the payout')

  const payoutTx = api.tx.fellowshipSalary.payout()
  await signFakeWithApi(api, payoutTx, account)
  await payoutTx.send()

  await newBlock(collectives)

  console.log('Trigger asset hub XCM execution')

  await newBlock(assetHub)
}

const newBlock = async ({
  api,
  dev,
  chain,
}: Awaited<ReturnType<typeof setupNetworks>>[string], newBlockParams?: any) => {
  console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>')
  console.log('Creating new block...')

  await dev.newBlock(newBlockParams)
  await chain.upcomingBlocks()

  const blockNumber = (await api.query.system.number()).toNumber()
  const events = await api.query.system.events()

  console.log('New block created')
  console.log('Block number:', blockNumber)
  console.log('Events:', events.toHuman())

  console.log('<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<')
}

main().catch(console.error)
