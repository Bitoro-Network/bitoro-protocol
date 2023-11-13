import hre, { ethers } from "hardhat"
import { restorableEnviron } from "./deployer/environ"
import { toWei, toUnit, toBytes32, rate, ensureFinished, ReferenceOracleType } from "../test/deployUtils"
import { Deployer, DeploymentOptions } from "./deployer/deployer"
import { LiquidityPool, OrderBook, LiquidityManager, Reader, NativeUnwrapper } from "../typechain"
import { BitoroToken, BlpToken, MockERC20 } from "../typechain"
import { Contract, ContractReceipt } from "ethers"
import { transferThroughDemoBridge } from "./demoBridgeTransfer"
import { Vault } from "../typechain/Vault"

const TOKEN_POSTFIX = "0328"
const keeperAddress = "0xc6b1458fcc02abc7f3d912fa60c7fb59c957fbf0"

const ENV: DeploymentOptions = {
  network: hre.network.name,
  artifactDirectory: "./artifacts/contracts",
  addressOverride: {
    // ArbRinkeby
    ProxyAdmin: { address: "0x1D34658aD1259F515246335A11372Fe51330999d" },
    WETH9: { address: "0xB47e6A5f8b33b3F17603C83a0535A9dcD7E32681" },
    DemoBridge: { address: "0x505F6EB30251097929c6a89d89F812A270bb098b" },
  },
}

async function faucet(deployer: Deployer) {
  const accounts = await ethers.getSigners()
  console.log("faucet")
  const usdc: MockERC20 = await deployer.deployOrSkip("MockERC20", "MockUsdc", "USD Coin", "USDC", 6) // https://etherscan.io/token/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
  const usdt: MockERC20 = await deployer.deployOrSkip("MockERC20", "MockUsdt", "Tether USD", "USDT", 6) // https://etherscan.io/token/0xdac17f958d2ee523a2206206994597c13d831ec7
  const dai: MockERC20 = await deployer.deployOrSkip("MockERC20", "MockDai", "Dai Stablecoin", "DAI", 18) // https://etherscan.io/token/0x6b175474e89094c44da98b954eedeac495271d0f
  const wbtc: MockERC20 = await deployer.deployOrSkip("MockERC20", "MockWbtc", "Wrapped BTC", "WBTC", 8) // https://etherscan.io/token/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599
  const ftm: MockERC20 = await deployer.deployOrSkip("MockERC20", "MockFtm", "Fantom Token", "FTM", 18) // https://etherscan.io/token/0x4e15361fd6b4bb609fa63c81a2be19d873717870
  const link: MockERC20 = await deployer.deployOrSkip("MockERC20", "MockLink", "ChainLink Token", "LINK", 18) // https://etherscan.io/token/0x514910771af9ca656af840dff83e8264ecf986ca
  for (let a of [
    // "0xba893CfA648f46F92a29911589f1A353b6AA4938", // t1
  ]) {
    console.log("to", a)
    await usdc.mint(a, toUnit("200000", 6))
    await usdt.mint(a, toUnit("200000", 6))
    await dai.mint(a, toWei("200000"))
    await wbtc.mint(a, toUnit("4", 8))
    await ftm.mint(a, toWei("200000"))
    await link.mint(a, toWei("10000"))
  }
}

async function preset1(deployer: Deployer) {
  console.log("preset1")
  const accounts = await ethers.getSigners()
  const pool: LiquidityPool = await deployer.getDeployedContract("LiquidityPool", "LiquidityPool")
  const orderBook: OrderBook = await deployer.getDeployedContract("OrderBook", "OrderBook")
  const liquidityManager: LiquidityManager = await deployer.getDeployedContract("LiquidityManager", "LiquidityManager")

  // deploy
  const weth9: MockERC20 = await deployer.getDeployedContract("MockERC20", "WETH9")
  const usdc: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockUsdc")
  const usdt: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockUsdt")
  const dai: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockDai")
  const wbtc: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockWbtc")
  const ftm: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockFtm")
  const link: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockLink")
  const bitoroUsd: BitoroToken = await deployer.getDeployedContract("BitoroToken", "BitoroUsd")
  const bitoroWeth: BitoroToken = await deployer.getDeployedContract("BitoroToken", "BitoroWeth")
  const bitoroWbtc: BitoroToken = await deployer.deployOrSkip("BitoroToken", "BitoroWbtc")
  const bitoroFtm: BitoroToken = await deployer.deployOrSkip("BitoroToken", "BitoroFtm")
  const bitoroAvax: BitoroToken = await deployer.deployOrSkip("BitoroToken", "BitoroAvax")
  const bitoroLink: BitoroToken = await deployer.deployOrSkip("BitoroToken", "BitoroLink")

  console.log("init tokens")
  await bitoroWbtc.initialize("BITORO Token for WBTC", "bitoroWBTC" + TOKEN_POSTFIX)
  await bitoroAvax.initialize("BITORO Token for AVAX", "bitoroAVAX" + TOKEN_POSTFIX)
  await bitoroLink.initialize("BITORO Token for LINK", "bitoroLINK" + TOKEN_POSTFIX)

  console.log("transfer bitoro")
  await bitoroWbtc.transfer(pool.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await bitoroFtm.transfer(pool.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await bitoroAvax.transfer(pool.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await bitoroLink.transfer(pool.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 97, bitoroWbtc.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 97, bitoroFtm.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 97, bitoroAvax.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 97, bitoroLink.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 4002, bitoroWbtc.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 4002, bitoroFtm.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 4002, bitoroAvax.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 4002, bitoroLink.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 43113, bitoroWbtc.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 43113, bitoroFtm.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 43113, bitoroAvax.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 43113, bitoroLink.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)

  // ----------------------------------------------------------------------------------

  console.log("add stable coins")
  // id, symbol, decimals, stable, token, bitoro
  await ensureFinished(pool.addAsset(0, toBytes32("USDC"), 6, true, usdc.address, bitoroUsd.address))
  await ensureFinished(pool.addAsset(1, toBytes32("USDT"), 6, true, usdt.address, bitoroUsd.address))
  await ensureFinished(pool.addAsset(2, toBytes32("DAI"), 18, true, dai.address, bitoroUsd.address))
  // id, symbol, imr, mmr, fee, fee, minBps, minTime, maxLong, maxShort, spotWeight, halfSpread
  await pool.setAssetParams(0, toBytes32("USDC"), rate("0"), rate("0"), rate("0"), rate("0"), rate("0"), 0, toWei("0"), toWei("0"), 1, rate("0"))
  await pool.setAssetParams(1, toBytes32("USDT"), rate("0"), rate("0"), rate("0"), rate("0"), rate("0"), 0, toWei("0"), toWei("0"), 1, rate("0"))
  await pool.setAssetParams(2, toBytes32("DAI"), rate("0"), rate("0"), rate("0"), rate("0"), rate("0"), 0, toWei("0"), toWei("0"), 1, rate("0"))
  for (let tokenId = 0; tokenId < 3; tokenId++) {
    console.log("set stable coin", tokenId)

    // id, tradable, openable, shortable, useStable, enabled, strict, liq
    await pool.setAssetFlags(tokenId, false, false, false, false, true, true, true)
    await pool.setFundingParams(tokenId, rate("0.00011"), rate("0.0008"))
  }

  // ----------------------------------------------------------------------------------

  console.log("add other coins")
  // id, symbol, decimals, stable, token, bitoro
  await ensureFinished(pool.addAsset(3, toBytes32("ETH"), 18, false, weth9.address, bitoroWeth.address))
  await ensureFinished(pool.addAsset(4, toBytes32("BTC"), 8, false, wbtc.address, bitoroWbtc.address))
  await ensureFinished(pool.addAsset(5, toBytes32("FTM"), 18, false, ftm.address, bitoroFtm.address))
  await ensureFinished(pool.addAsset(6, toBytes32("AVAX"), 18, false, "0x0000000000000000000000000000000000000000", bitoroAvax.address))
  await ensureFinished(pool.addAsset(7, toBytes32("LINK"), 18, false, link.address, bitoroLink.address))
  // id, symbol, imr, mmr, fee, fee, minBps, minTime, maxLong, maxShort, spotWeight, halfSpread
  await pool.setAssetParams(3, toBytes32("ETH"), rate("0.006"), rate("0.005"), rate("0.001"), rate("0.005"), rate("0.001"), 60, toWei("1000000"), toWei("1000000"), 2, rate("0"))
  await pool.setAssetParams(4, toBytes32("BTC"), rate("0.006"), rate("0.005"), rate("0.001"), rate("0.005"), rate("0.001"), 60, toWei("1000000"), toWei("1000000"), 2, rate("0"))
  await pool.setAssetParams(5, toBytes32("FTM"), rate("0.006"), rate("0.005"), rate("0.001"), rate("0.005"), rate("0.001"), 60, toWei("1000000"), toWei("1000000"), 2, rate("0.0012"))
  await pool.setAssetParams(6, toBytes32("AVAX"), rate("0.006"), rate("0.005"), rate("0.001"), rate("0.005"), rate("0.001"), 60, toWei("1000000"), toWei("1000000"), 2, rate("0.0012"))
  await pool.setAssetParams(7, toBytes32("LINK"), rate("0.006"), rate("0.005"), rate("0.001"), rate("0.005"), rate("0.001"), 60, toWei("1000000"), toWei("1000000"), 2, rate("0"))
  for (let tokenId = 3; tokenId < 8; tokenId++) {
    console.log("set other coins", tokenId)

    let useStable = false
    if (tokenId === 6 /* avax */) {
      useStable = true
    }
    // id, tradable, openable, shortable, useStable, enabled, strict, liq
    await pool.setAssetFlags(tokenId, true, true, true, useStable, true, false, true)

    await pool.setFundingParams(tokenId, rate("0.0001"), rate("0.0008"))
  }

  // ----------------------------------------------------------------------------------

  console.log("reference oracle")

  // arbRinkeby
  await pool.setReferenceOracle(3, ReferenceOracleType.Chainlink, "0x5f0423B1a6935dc5596e7A24d98532b67A0AeFd8", rate("0.03")) // ETH
  await pool.setReferenceOracle(4, ReferenceOracleType.Chainlink, "0x0c9973e7a27d00e656B9f153348dA46CaD70d03d", rate("0.03")) // BTC
  await pool.setReferenceOracle(7, ReferenceOracleType.Chainlink, "0x52C9Eb2Cc68555357221CAe1e5f2dD956bC194E5", rate("0.03")) // LINK

  // ----------------------------------------------------------------------------------

  // console.log("add dex - weth-usdc")
  // await liquidityManager.addDexSpotConfiguration("MockUniswap2", 3, [0, 3], [4, 5])
}

async function addLiq(deployer: Deployer) {
  const accounts = await ethers.getSigners()
  const lp1 = accounts[2]

  const pool: LiquidityPool = await deployer.getDeployedContract("LiquidityPool", "LiquidityPool")
  const orderBook: OrderBook = await deployer.getDeployedContract("OrderBook", "OrderBook")
  const liquidityManager: LiquidityManager = await deployer.getDeployedContract("LiquidityManager", "LiquidityManager")

  // deploy
  const weth9: MockERC20 = await deployer.getDeployedContract("MockERC20", "WETH9")
  const usdc: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockUsdc")
  const usdt: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockUsdt")
  const dai: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockDai")
  const wbtc: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockWbtc")
  const link: MockERC20 = await deployer.getDeployedContract("MockERC20", "MockLink")
  const bitoroUsd: BitoroToken = await deployer.getDeployedContract("BitoroToken", "BitoroUsd")
  const bitoroWeth: BitoroToken = await deployer.getDeployedContract("BitoroToken", "BitoroWeth")
  const bitoroWbtc: BitoroToken = await deployer.getDeployedContract("BitoroToken", "BitoroWbtc")
  const bitoroFtm: BitoroToken = await deployer.getDeployedContract("BitoroToken", "BitoroFtm")
  const bitoroAvax: BitoroToken = await deployer.getDeployedContract("BitoroToken", "BitoroAvax")
  const bitoroLink: BitoroToken = await deployer.getDeployedContract("BitoroToken", "BitoroLink")

  console.log("temporarily close liquidity lock (test only)")
  await orderBook.setLiquidityLockPeriod(0)

  // ----------------------------------------------------------------------------------

  console.log("add liquidity - usd")
  await usdc.mint(lp1.address, toUnit("1000000", 6)) // faucet
  await usdt.mint(lp1.address, toUnit("1000000", 6)) // faucet
  await dai.mint(lp1.address, toWei("1000000")) // faucet
  await ensureFinished(usdc.connect(accounts[2]).approve(orderBook.address, toUnit("1000000", 6)))
  await ensureFinished(usdt.connect(accounts[2]).approve(orderBook.address, toUnit("1000000", 6)))
  await ensureFinished(dai.connect(accounts[2]).approve(orderBook.address, toWei("1000000")))
  {
    const tx1 = (await ensureFinished(orderBook.connect(accounts[2]).placeLiquidityOrder(0, toUnit("1000000", 6), true))) as ContractReceipt
    const orderId = getOrderId(tx1)
    await ensureFinished(orderBook.connect(accounts[1]).fillLiquidityOrder(orderId, toWei("1"), toWei("1"), toWei("0"), toWei("0")))
  }
  {
    const tx1 = (await ensureFinished(orderBook.connect(accounts[2]).placeLiquidityOrder(1, toUnit("1000000", 6), true))) as ContractReceipt
    const orderId = getOrderId(tx1)
    await ensureFinished(orderBook.connect(accounts[1]).fillLiquidityOrder(orderId, toWei("1"), toWei("1"), toWei("0"), toWei("0")))
  }
  {
    const tx1 = (await ensureFinished(orderBook.connect(accounts[2]).placeLiquidityOrder(2, toWei("1000000"), true))) as ContractReceipt
    const orderId = getOrderId(tx1)
    await ensureFinished(orderBook.connect(accounts[1]).fillLiquidityOrder(orderId, toWei("1"), toWei("1"), toWei("0"), toWei("0")))
  }

  console.log("add liquidity - btc")
  await wbtc.mint(lp1.address, toUnit("200", 8)) // faucet
  await ensureFinished(wbtc.connect(accounts[2]).approve(orderBook.address, toUnit("200", 8)))
  {
    const tx1 = (await ensureFinished(orderBook.connect(accounts[2]).placeLiquidityOrder(4, toUnit("200", 8), true))) as ContractReceipt
    const orderId = getOrderId(tx1)
    await ensureFinished(orderBook.connect(accounts[1]).fillLiquidityOrder(orderId, toWei("40000"), toWei("1"), toWei("0"), toWei("0")))
  }

  // ----------------------------------------------------------------------------------

  console.log("add liquidity through bridge")
  await usdc.mint(lp1.address, toUnit("1000000", 6)) // faucet
  await wbtc.mint(lp1.address, toUnit("20", 8)) // faucet
  await transferThroughDemoBridge(deployer, lp1, 97, usdc.address, toUnit("1000000", 6))
  await transferThroughDemoBridge(deployer, lp1, 97, wbtc.address, toUnit("20", 8)) // < toWei(PreMinedTokenTotalSupply)

  // ----------------------------------------------------------------------------------

  console.log("recovery liquidity lock (test only)")
  await orderBook.setLiquidityLockPeriod(5 * 60)
}

function getOrderId(receipt: ContractReceipt): string {
  let orderId = "0"
  for (let event of receipt.events!) {
    if (event.event === "NewLiquidityOrder") {
      orderId = event.args!.orderId.toString()
      console.log("orderId:", orderId)
    }
  }
  return orderId
}

async function main(deployer: Deployer) {
  const accounts = await ethers.getSigners()
  if (accounts.length < 3) {
    throw new Error("this script needs 3 accounts: deployer, broker, lp")
  }

  // deploy
  let proxyAdmin = deployer.addressOf("ProxyAdmin")
  const weth9: MockERC20 = await deployer.getDeployedContract("MockERC20", "WETH9")
  const blpToken: BlpToken = await deployer.deployUpgradeableOrSkip("BlpToken", "Blp", proxyAdmin)
  await deployer.deployUpgradeableOrSkip("LiquidityPoolHop1", "LiquidityPool", proxyAdmin)
  const poolHop2: Contract = await deployer.deployOrSkip("LiquidityPoolHop2", "LiquidityPoolHop2")
  const pool: LiquidityPool = await deployer.getDeployedContract("LiquidityPool", "LiquidityPool")
  const orderBook: OrderBook = await deployer.deployUpgradeableOrSkip("OrderBook", "OrderBook", proxyAdmin)
  await deployer.deployUpgradeableOrSkip("LiquidityManager", "LiquidityManager", proxyAdmin)
  const liquidityManager = await deployer.getDeployedContract("LiquidityManager", "LiquidityManager")
  const reader: Reader = await deployer.deployOrSkip("Reader", "Reader", pool.address, blpToken.address, liquidityManager.address, orderBook.address, [
    accounts[0].address, // deployer's bitoro tokens are not debt
  ])
  const nativeUnwrapper: NativeUnwrapper = await deployer.deployOrSkip("NativeUnwrapper", "NativeUnwrapper", weth9.address)
  const vault: Vault = await deployer.deployUpgradeableOrSkip("Vault", "Vault", proxyAdmin)
  const bitoroUsd: BitoroToken = await deployer.deployOrSkip("BitoroToken", "BitoroUsd")
  const bitoroWeth: BitoroToken = await deployer.deployOrSkip("BitoroToken", "BitoroWeth")

  // init
  console.log("init")
  await ensureFinished(blpToken.initialize("BITORO LP", "BITOROLP" + TOKEN_POSTFIX))
  await ensureFinished(bitoroUsd.initialize("BITORO Token for USD", "bitoroUSD" + TOKEN_POSTFIX))
  await ensureFinished(bitoroWeth.initialize("BITORO Token for WETH", "bitoroWETH" + TOKEN_POSTFIX))
  await ensureFinished(pool.initialize(poolHop2.address, blpToken.address, orderBook.address, weth9.address, nativeUnwrapper.address, vault.address))
  await ensureFinished(orderBook.initialize(pool.address, blpToken.address, weth9.address, nativeUnwrapper.address))
  await orderBook.addBroker(accounts[1].address)
  await orderBook.addBroker(keeperAddress)
  await orderBook.setLiquidityLockPeriod(5 * 60)
  await orderBook.setOrderTimeout(300, 86400 * 365)
  await ensureFinished(liquidityManager.initialize(vault.address, pool.address))
  // fundingInterval, liqBase, liqDyn, σ_strict, brokerGas
  await pool.setNumbers(3600 * 8, rate("0.0025"), rate("0.005"), rate("0.01"), toWei("0"))
  // blpPrice, blpPrice
  await pool.setEmergencyNumbers(toWei("0.5"), toWei("1.1"))
  await pool.setLiquidityManager(liquidityManager.address, true)
  await ensureFinished(nativeUnwrapper.addWhiteList(pool.address))
  await ensureFinished(nativeUnwrapper.addWhiteList(orderBook.address))
  await ensureFinished(vault.initialize())

  console.log("transfer blp")
  await blpToken.transfer(pool.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 97, blpToken.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 4002, blpToken.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 43113, blpToken.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)

  console.log("transfer bitoroUsd")
  await bitoroUsd.transfer(pool.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await bitoroWeth.transfer(pool.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 97, bitoroUsd.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 97, bitoroWeth.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 4002, bitoroUsd.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 4002, bitoroWeth.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 43113, bitoroUsd.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)
  await transferThroughDemoBridge(deployer, accounts[0], 43113, bitoroWeth.address, toWei("10000000000000000")) // < toWei(PreMinedTokenTotalSupply)

  // presets
  await faucet(deployer)
  await preset1(deployer)
  await addLiq(deployer)
}

restorableEnviron(ENV, main)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
