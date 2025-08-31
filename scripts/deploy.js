const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying Authenzia NFT Marketplace contracts...");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Deploy USDC mock token for testing (on testnets)
  let usdcAddress;
  const network = await ethers.provider.getNetwork();
  
  if (network.chainId === 84532) { // Base Sepolia
    // Use existing USDC on Base Sepolia
    usdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC
  } else if (network.chainId === 8453) { // Base Mainnet
    usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base Mainnet USDC
  } else {
    // Deploy mock USDC for local testing
    console.log("📄 Deploying Mock USDC...");
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUSDC = await MockUSDC.deploy();
    await mockUSDC.deployed();
    usdcAddress = mockUSDC.address;
    console.log("Mock USDC deployed to:", usdcAddress);
  }

  // Deploy AuthenziaNFT contract
  console.log("📄 Deploying AuthenziaNFT...");
  const AuthenziaNFT = await ethers.getContractFactory("AuthenziaNFT");
  const nftContract = await AuthenziaNFT.deploy(
    "Authenzia NFT", // name
    "AUTH", // symbol
    deployer.address, // marketplace fee recipient
    deployer.address // authorized minter
  );
  await nftContract.deployed();
  console.log("AuthenziaNFT deployed to:", nftContract.address);

  // Deploy AuthenziaMarketplace contract
  console.log("📄 Deploying AuthenziaMarketplace...");
  const AuthenziaMarketplace = await ethers.getContractFactory("AuthenziaMarketplace");
  const marketplace = await AuthenziaMarketplace.deploy(
    deployer.address, // fee recipient
    usdcAddress // default payment token (USDC)
  );
  await marketplace.deployed();
  console.log("AuthenziaMarketplace deployed to:", marketplace.address);

  // Set marketplace as approved operator for NFT contract
  console.log("🔗 Setting up contract permissions...");
  await nftContract.setApprovalForAll(marketplace.address, true);
  console.log("Marketplace approved for NFT transfers");

  // Update environment variables
  console.log("\n📝 Contract addresses for .env file:");
  console.log(`CONTRACT_ADDRESS=${nftContract.address}`);
  console.log(`MARKETPLACE_ADDRESS=${marketplace.address}`);
  console.log(`USDC_ADDRESS=${usdcAddress}`);
  console.log(`CHAIN_ID=${network.chainId}`);

  // Verify contracts on Etherscan (if not local)
  if (network.chainId !== 1337 && network.chainId !== 31337) {
    console.log("\n⏳ Waiting for block confirmations...");
    await nftContract.deployTransaction.wait(5);
    await marketplace.deployTransaction.wait(5);

    console.log("🔍 Verifying contracts on block explorer...");
    
    try {
      await hre.run("verify:verify", {
        address: nftContract.address,
        constructorArguments: [
          "Authenzia NFT",
          "AUTH",
          deployer.address,
          deployer.address
        ],
      });
      console.log("✅ AuthenziaNFT verified");
    } catch (error) {
      console.log("❌ NFT verification failed:", error.message);
    }

    try {
      await hre.run("verify:verify", {
        address: marketplace.address,
        constructorArguments: [
          deployer.address,
          usdcAddress
        ],
      });
      console.log("✅ AuthenziaMarketplace verified");
    } catch (error) {
      console.log("❌ Marketplace verification failed:", error.message);
    }
  }

  // Save deployment info
  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId,
    deployer: deployer.address,
    contracts: {
      AuthenziaNFT: nftContract.address,
      AuthenziaMarketplace: marketplace.address,
      USDC: usdcAddress
    },
    deployedAt: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber()
  };

  const fs = require('fs');
  fs.writeFileSync(
    './deployments.json',
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n🎉 Deployment completed successfully!");
  console.log("📄 Deployment info saved to deployments.json");
}

// Mock USDC contract for testing
const mockUSDCSource = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {
        _mint(msg.sender, 1000000 * 10**6); // 1M USDC with 6 decimals
    }
    
    function decimals() public pure override returns (uint8) {
        return 6;
    }
    
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
`;

// Save Mock USDC contract
const fs = require('fs');
if (!fs.existsSync('./contracts/MockUSDC.sol')) {
  fs.writeFileSync('./contracts/MockUSDC.sol', mockUSDCSource);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
