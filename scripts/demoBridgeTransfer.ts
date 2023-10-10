import { ethers } from "ethers";
import { Deployer, DeploymentOptions } from "./deployer/deployer"


async function transferThroughDemoBridge(
    deployer: Deployer,
    fromAccount: ethers.Signer,
    bridgeId: number,
    tokenAddress: string,
    amount: ethers.BigNumber
) {
    const bridgeContract = await deployer.getDeployedContract("DemoBridge", "DemoBridge"); // Replace with the actual contract name and deployment method

    const fromAddress = await fromAccount.getAddress();
    const tx = await bridgeContract.transferTokens(bridgeId, fromAddress, tokenAddress, amount);
    await tx.wait();
}

export { transferThroughDemoBridge };
