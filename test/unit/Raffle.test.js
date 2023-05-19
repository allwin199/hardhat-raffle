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
          let raffle, deployer, VRFCoordinatorV2Mock, raffleEntranceFee, interval, accounts;
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

          //these test will be just for the constructor
          describe("constructor", () => {
              it("initializes the raffle correctly", async () => {
                  const raffleState = await raffle.getRaffleState();
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
              it("records players when they enter", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  const playerFromContract = await raffle.getPlayer(0);
                  assert.equal(playerFromContract, deployer);
              });
              it("emits event on enter", async () => {
                  //testing whether function emits an event
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  );
              });
              it("dosen't allow entrance when raffle is calculating", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });

                  // to check this, we need to move raffleState to calculating
                  // in the actual contract, performupkeep is making the state change
                  // s_raffleState = RaffleState.CALCULATING;
                  // but for performupkeep to make the change, checkupkeep() should return true.
                  // for checkupkeep to return true
                  // raffleState should be open, which is true now
                  // there should be limited amount of time passed inorder to change the state
                  // let's simulate the time passed
                  // evm_increase time, allows us to increase the time blockchain automatically
                  // evm_mine allows us to mine new blocks,
                  // even if we increase the time, it will not do anything unless there is a new block mined
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.send("evm_mine", []);
                  // our interval is 30s, since we are doing interval.toNumber() + 1,
                  // now the time will be 31s and also new block is mined,
                  // so checkupkeep will return true and performupkeep will execute
                  // for a documentation of the methods, go here: https://hardhat.org/hardhat-network/reference
                  // let's pretend to be a chainlink keeper
                  await raffle.performUpkeep([]);
                  // we are passing an empty calldata.
                  // now performupkeep will call checkupkeep and checkupkeep will return true,
                  // performupkeep will start executing
                  // since perfeormupkeep is executed, now the rafflestate will be calculating
                  // if anyone enters during this period, it will revert
                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee })
                  ).to.be.revertedWithCustomError(raffle, "Raffle__NotOpen");
              });
          });

          // test cases for checkupkeep
          describe("checkupkeep", async () => {
              it("returns false if people haven't sent any ETH", async () => {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  // here interval has passed and block has been mined
                  // but there is no player.
                  // let's see what happens when we call checkupkeep()
                  // since checkupkeep is a public fn, if we call directly it consider this call as a transaction.
                  // we need to simulate this, we are using callstatic for simulation
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x"); // it will return upkeepneeded
                  // upkeepneeded will return false because all the conditions are not met
                  assert(!upkeepNeeded);
                  //   assert.equal(upkeepNeeded, false);
                  // !upkeepneeded will return true, so the test will pass
              });
              it("returns false if raffle isn't open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  // above 3 statements will return the checkupkeep true, so performupkeep will be executed
                  await raffle.performUpkeep([]);
                  // when performupkeep is called, raffle state will be changed to calculating
                  const raffleState = await raffle.getRaffleState();
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x"); //0x -> empty byte
                  // now when we simulate a checkupkeep call, since the rafflestate is calculating, it will return false
                  assert.equal(raffleState.toString(), "1");
                  assert.equal(upkeepNeeded, false);
              });
              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
                  // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded);
              });
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
                  assert(upkeepNeeded);
              });
          });

          describe("performUpkeep", function () {
              it("can only run if checkupkeep is true", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  const tx = await raffle.performUpkeep("0x");
                  // when we call performUpKeep, it will call checkupkeep and check wether it returns true
                  // if it returns true, performupkeep will get executed.
                  assert(tx);
              });
              it("reverts if checkup is false", async () => {
                  await expect(raffle.performUpkeep("0x")).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__UpkeepNotNeeded"
                  );
              });
              it("updates the raffle state and emits a requestId", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  const txResponse = await raffle.performUpkeep("0x"); // emits requestId
                  const txReceipt = await txResponse.wait(1); // waits 1 block
                  const raffleState = await raffle.getRaffleState(); // updates state
                  const requestId = txReceipt.events[1].args.requestId;
                  // second param is the request Id -> [1]
                  assert(requestId.toNumber() > 0);
                  assert(raffleState == 1); // 0 = open, 1 = calculating
              });
          });

          describe("fulfillRandomWords", function () {
              beforeEach(async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
              });
              it("can only be called after performupkeep", async () => {
                  await expect(
                      VRFCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request");
                  //   when perfromupkeep is executed, it will call this fn
                  // VRFCoordinatorV2Interface(vrfCoordinatorV2).requestRandomWords()
                  // in raffle.sol we are overriding this fn.
                  // this revert fn is written inbuilt in the vrfCoordinatorV2Mock
                  await expect(
                      VRFCoordinatorV2Mock.fulfillRandomWords(1, raffle.address) // reverts if not fulfilled
                  ).to.be.revertedWith("nonexistent request");
                  //   subId of 0 & 1 are randomBytes, so it will be reverted
              });
              it("picks a winner, resets, and sends money", async () => {
                  const additionalEntrances = 3; // to test
                  const startingIndex = 1; //deployer 0
                  for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) {
                      // i = 1; i < 4; i=i+1
                      raffle = raffle.connect(accounts[i]);
                      // Returns a new instance of the Raffle contract connected to player
                      await raffle.enterRaffle({ value: raffleEntranceFee });
                  }
                  const startingTimeStamp = await raffle.getLastTimeStamp();
                  // stores starting timestamp (before we fire our event)

                  // performUpkeep (mock being chainlink keepers)
                  // fullfillRandomWords (mock being the Chainlink VRF)
                  await new Promise(async (resolve, reject) => {
                      // name of the event is WinnerPicked and it is listening to that event
                      // whever this event is emiited, we are doing some stuff which is the callback fn
                      // if this event dosen't get fired in 200s, this will be considered as a failure and this test will fail
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!");
                          try {
                              const recentWinner = await raffle.getRecentWinner();
                              const raffleState = await raffle.getRaffleState();
                              const endingTimeStamp = await raffle.getLastTimeStamp();

                              //   let's test wether players array is reset to 0
                              const numPlayers = await raffle.getNumberOfPlayers();
                              const winnerEndingBalance = await accounts[1].getBalance();
                              assert.equal(numPlayers.toString(), "0");
                              assert(endingTimeStamp > startingTimeStamp);
                              assert.equal(raffleState.toString(), "0");
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(
                                      raffleEntranceFee
                                          .mul(additionalEntrances)
                                          .add(raffleEntranceFee)
                                          .toString()
                                  )
                              );
                              resolve();
                          } catch (error) {
                              reject(error);
                              console.log(error);
                          }
                      });
                      const tx = await raffle.performUpkeep([]);
                      const txReceipt = await tx.wait(1);
                      const winnerStartingBalance = await accounts[1].getBalance();
                      await VRFCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      );
                      //  when the above fn is executed, it will emit the Winnerpicked event, and raffle.once will start executing
                  });
              });
          });
      });
