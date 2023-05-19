const { assert, expect } = require("chai");
const { network, deployments, getNamedAccounts, ethers } = require("hardhat");
const { networkConfig } = require("../../helper-hardhat-config");

const chainId = network.config.chainId;

chainId !== 31337
    ? describe.skip
    : describe("Raffle Unit Tests", () => {
          //we are going to deploy Raffle contract using hardhat deploy
          // fixture allows to run the deploy folder with many tags as we want
          // when we say ["all"] it will run through all deploy scripts and deploy
          let raffle, deployer, VRFCoordinatorV2Mock, raffleEntranceFee;
          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer;
              await deployments.fixture(["all"]); //this line of code will deploy all our contracts
              raffle = await ethers.getContract("Raffle", deployer);
              //ethers work with hardhat, using getContract it will provide the latest one.
              // the reson we are adding deployer is, whenver we call that fundMe it will be from that deployer account
              VRFCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
              // we are getting the deployed mock contract
              // since we are running locally, we are testing with mock contract
              raffleEntranceFee = await raffle.getEntranceFee();
          });

          //these test will be just for the constructor
          describe("constructor", () => {
              it("initializes the raffle correctly", async () => {
                  const raffleState = await raffle.getRaffleState();
                  const interval = await raffle.getInterval();
                  const vrfCoordinatorAddress = await raffle.getVrfCoordinatorAddress();
                  const entranceFee = await raffle.getEntranceFee();

                  assert.equal(raffleState.toString(), "0"); //since it is a Enum type, it will give a uint256 0.
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
                  //   checking whether getVrfCoordinatorAddress is same as VRFCoordinatorV2Mock.address
                  assert.equal(VRFCoordinatorV2Mock.address, vrfCoordinatorAddress);
                  assert.equal(
                      networkConfig[chainId]["entranceFee"].toString(),
                      entranceFee.toString()
                  );
              });
          });

          //test cases for enter raffle
          describe("enter raffle", () => {
              it("reverts when you don't pay enough", async () => {
                  await expect(raffle.enterRaffle()).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__NotEnoughETHEntered"
                  );
              });
              //   it.only("Raffle is not open", ()=>{
              //     await expect()
              //   })
              it.only("records players when they enter", async () => {
                  const response = await raffle.enterRaffle({ value: raffleEntranceFee });
                  const playerFromContract = await raffle.getPlayer(0);
                  assert.equal(playerFromContract, deployer);
              });
          });
      });
