const hre = require("hardhat");

async function main() {
    console.log("Deploying EthLockVault...");

    // Get signer for ethers v6 compatibility
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with account:", deployer.address);

    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

    const EthLockVault = await hre.ethers.getContractFactory("EthLockVault");
    const lockVault = await EthLockVault.deploy();

    await lockVault.waitForDeployment();

    const address = await lockVault.getAddress();
    console.log("\n✅ EthLockVault deployed to:", address);
    console.log("\nView on Etherscan:");
    console.log(`https://sepolia.etherscan.io/address/${address}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
