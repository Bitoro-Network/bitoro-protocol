import { task } from "hardhat/config"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { BigNumber } from "ethers"
import "@typechain/hardhat"
import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-waffle"
import "@nomiclabs/hardhat-etherscan"
//import "solidity-coverage"
//import "hardhat-gas-reporter"
import * as dotenv from 'dotenv';
// Load environment variables from .env file into process.env
dotenv.config();

import { retrieveLinkReferences } from "./scripts/deployer/linkReferenceParser"

const {
  DEPLOYER_PRIV_KEY: privKey,
  ARBISCAN_MAIN_API_KEY: arbitrumOne,
  ARBISCAN_GOERLI_API_KEY: arbitrumGoerli
} = process.env

task(
  "balances",
  "Prints the list of AVAX account balances",
  async (args, hre): Promise<void> => {
    const accounts: SignerWithAddress[] = await hre.ethers.getSigners()
    for (const account of accounts) {
      const balance: BigNumber = await hre.ethers.provider.getBalance(
        account.address
      )
      console.log(`${account.address} has balance ${balance.toString()}`)
    }
  }
)

task("deploy", "Deploy a single contract")
  .addPositionalParam("name", "Name of contract to deploy")
  .addOptionalPositionalParam("args", "Args of contract constructor, separated by common ','")
  .setAction(async (args, hre) => {
    if (typeof args.args != "undefined") {
      args.args = args.args.split(",")
    }
    let nonce = await hre.ethers.provider.getTransactionCount(
      await hre.ethers.provider.getSigner(0).getAddress(),
      "pending"
    )
    console.log("nonce", nonce)
    const linkReferences = await retrieveLinkReferences("./artifacts/contracts")
    const links: { [contactName: string]: string } = {}
    const go = async (contractName: string) => {
      const innerLinks: { [contactName: string]: string } = {}
      for (let linkedContractName of linkReferences[contractName] || []) {
        if (linkedContractName in links) {
          innerLinks[linkedContractName] = links[linkedContractName]
        } else {
          const deployed = await go(linkedContractName)
          innerLinks[linkedContractName] = deployed
          links[linkedContractName] = deployed
        }
      }
      const factory = await hre.ethers.getContractFactory(contractName, { libraries: innerLinks })
      const constructArgs = args.args ? args.args : []
      console.log("deploying", contractName, "links:", innerLinks, "ctor:", constructArgs, "nonce:", nonce)
      constructArgs.push({ nonce: nonce++ })
      const deployed = await factory.deploy(...constructArgs)
      console.log(contractName, "deployed at", deployed.address)
      await deployed.deployTransaction.wait()
      return deployed.address
    }
    await go(args.name)
  })

module.exports = {
  defaultNetwork: "arb1",
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    arb1: { // arbitrum one
      url: `https://arb1.arbitrum.io/rpc`,
      // gasPrice: 2e9,
      // blockGasLimit: "80000000",
      accounts: [privKey],
    },
    arbGoerli: { // arbitrum testnet
      url: `https://arb-goerli.g.alchemy.com/v2/2mNlhhYJxcMYdgUWZU7gx9yFZ8ZOmyz_`,
      // gasPrice: 5e9,
      blockGasLimit: "80000000",
      accounts: [],
    },
    snowtrace: { // avalanche c-chain
      url: `https://api.avax.network/ext/bc/C/rpc`,
      accounts: [privKey]
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.4.18",
        settings: {
          optimizer: {
            enabled: false, // see https://bscscan.com/address/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
            runs: 200,
          },
        },
      },
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.10",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  etherscan: {
    apiKey: {
      arbitrumOne,
      arbitrumGoerli,
      snowtrace: "snowtrace", // apiKey is not required, just set a placeholder
    },
    customChains: [
      {
        network: "snowtrace",
        chainId: 43114,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan",
          browserURL: "https://avalanche.routescan.io"
        }
      }
    ]
  },
  mocha: {
    timeout: 60000,
  },
  gasReporter: {
    currency: "ETH",
    gasPrice: 100,
  },
  typechain: {
    outDir: "typechain",
    target: "./misc/typechain-ethers-v5-bitoro",
  },
}
