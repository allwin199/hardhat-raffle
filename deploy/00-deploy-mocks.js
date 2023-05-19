const { network, ethers } = require("hardhat");

const BASE_FEE = ethers.utils.parseEther("0.25"); //0.25 is the premium. It consts 0.25 LINK per request
const GAS_PRICE_LINK = 1e9; //link per gas. calculated value based on gas price of the chain

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deployer } = await getNamedAccounts();
    const { deploy, log } = deployments;
    const chainId = network.config.chainId;

    if (chainId === 31337) {
        log("Local network detected! Deploying mocks...");
        //deploy a mock vrfCoordinator..
        const raffle = await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            args: [BASE_FEE, GAS_PRICE_LINK],
            log: true,
            waitConfirmations: network.config.blockConfirmations || 1,
        });
        log("Mocks deployed!");
        log("-----------------------------");
    }
};

module.exports.tags = ["all", "mocks"];
