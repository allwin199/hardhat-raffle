const { assert, expect } = require("chai");
const { network, deployments, getNamedAccounts, ethers } = require("hardhat");
const { networkConfig } = require("../../helper-hardhat-config");

const chainId = network.config.chainId;

chainId === 31337
    ? describe.skip
    : describe("Raffle Unit Tests", () => {
          //we are going to deploy Raffle contract using hardhat deploy
          // fixture allows to run the deploy folder with many tags as we want
          // when we say ["all"] it will run through all deploy scripts and deploy
          let raffle, deployer, raffleEntranceFee;
          beforeEach(async () => {
              accounts = await ethers.getSigners();
              deployer = (await getNamedAccounts()).deployer;
              await deployments.fixture(["all"]); //this line of code will deploy all our contracts
              raffle = await ethers.getContract("Raffle", deployer);
              //ethers work with hardhat, using getContract it will provide the latest one.
              // the reson we are adding deployer is, whenver we call that fundMe it will be from that deployer account
              VRFCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
              // we are getting the deployed mock contract
              // since we are running locally, we are testing with mock contract
              raffleEntranceFee = await raffle.getEntranceFee();
              interval = await raffle.getInterval();
          });
      });
