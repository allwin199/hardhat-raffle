/**
 * Lottery Contract
 *
 * Functionality:
 * - Participants enter the lottery by paying a certain amount.
 * - A random winner is selected (verifiably random).
 * - The winner is chosen automatically at regular intervals (e.g., every x minutes, days, or months).
 *
 * Implementation Details:
 * - Since we require randomness, we rely on an external source and use Chainlink Oracle.
 * - Blockchain itself is deterministic, so external oracles like Chainlink provide real-world data and off-chain computation.
 * - To achieve automated execution, we utilize Chainlink Keepers, as smart contracts cannot self-execute.
 *
 * Note: Chainlink is a decentralized oracle network connecting smart contracts with real-world data and off-chain computation.
 */


// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AutomationCompatibleInterface.sol";

// Errors
error Raffle__NotEnoughETHEntered();
error Raffle__TransferFailed();
error Raffle__NotOpen();
error Raffle__UpkeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 raffleState);

/**@title A sample Raffle Contract
 * @author Prince Allwin
 * @notice This contract is for creating a sample raffle contract
 * @dev This implements the Chainlink VRF Version 2
 */
// we need to make this Raffle contract work with VRFConsumerBaseV2 and AutomationCompatibleInterface
contract Raffle is VRFConsumerBaseV2, AutomationCompatibleInterface{

    /* Type declarations */
    enum RaffleState {OPEN, CALCULATING} // uint256 0=OPEN 1=CALCULATING

    // State Variables
    uint256 private immutable i_entranceFee;
    address payable[] private s_players; 
    // if one the players win, we have to pay them so it should be payable
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;

    //variable to get random words
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint32 private immutable i_callbackGasLimit;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS = 1;

    // Lottery variables
    address private s_recentWinner; 
    RaffleState private s_raffleState; 
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;

    // Events
    event RaffleEnter(address indexed player); // it is taking one indexed parameter
    // it keeps track of all the players entered the raffle
    event RequestedRaffleWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed winner);
    // it keeps track of all the winners.

    constructor(
        address vrfCoordinatorV2,
        uint256 entranceFee, 
        bytes32 gasLane, 
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) 
        VRFConsumerBaseV2(vrfCoordinatorV2) 
    {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }
    // vrfCoordinatorV2 is the name of the address that does random number verification

    function enterRaffle() public payable {
        // require (msg.value < i_entranceFee, "Not enough ETH!");
        if(msg.value < i_entranceFee){
            revert Raffle__NotEnoughETHEntered();
        }
        if(s_raffleState != RaffleState.OPEN){
            revert Raffle__NotOpen();
        }   
        s_players.push(payable(msg.sender));
        // msg.sender is not a payable address, so we have to type cast it
        // Emit an event when we update a dynamic array or mapping
        // Named events with the function name reversed
        emit RaffleEnter(msg.sender);
    }

    /**
     * @dev This is the function that the Chainlink keeper nodes call
     * they look for the `upkeepNeeded` to return true
     * the following should be true in order to return true
     *  1. Our time interval should have passed
     *  2. The lottery should have at least 1 player, and have some ETH
     *  3. Our subscription is funded with LINK
     *  4. The lottery should be in an "open" state.
     */
    function checkUpkeep(bytes memory /*checkdata*/) public view override returns(bool upkeepNeeded, bytes memory /*performData*/) {
        bool isOpen = (s_raffleState == RaffleState.OPEN);
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        bool hasPlayers = (s_players.length > 0);
        bool hasBalance = address(this).balance > 0;
        upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
        // return (upkeepNeeded, "0x0");
        // if upKeepNeeded is true, then it is time to end the lottery and request for a random number
    }

    function performUpkeep(bytes calldata /*performData*/) external override{
        (bool upkeepNeeded, ) = checkUpkeep("");
        if(!upkeepNeeded){
            revert Raffle__UpkeepNotNeeded(address(this).balance, s_players.length, uint256(s_raffleState));
        }

        s_raffleState = RaffleState.CALCULATING;
        // Request the random number from chainlink vrf
        // Chainlink vrf is a 2 transaction process
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane, //gasLane
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit RequestedRaffleWinner(requestId);
    }
    // external functions are little bit cheaper than public functions
    // since we mentioned as external, solidity knows that our own functions can call this fn.
    // we are calling requestRandomWords on vrfcoordinator

    function fulfillRandomWords(uint256 /*requestId*/, uint256[] memory randomWords) internal override {
        uint256 indexOfWinner = randomWords[0] % s_players.length; // we are using modulo operator
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;
        s_raffleState = RaffleState.OPEN;
        //Resetting the array after winner is picked
        s_players = new address payable[](0); //resetting the array
        s_lastTimeStamp = block.timestamp; //resetting the timestamp
        //sending the money to the winner
        (bool success,) = recentWinner.call{value: address(this).balance}("");
        if(!success){
            revert Raffle__TransferFailed();
        }
        emit WinnerPicked(recentWinner);
    }
    // this will be the second transaction after requestRandomWinner
    // fullfillRandomWords fn is available in VRFConsumerBaseV2 and we are overriding it 

    // View / pure functions
    // entrance fee getter
    function getEntranceFee() public view returns(uint256){
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns(address){
        return s_players[index];
    }

    function getRecentWinner() public view returns(address){
        return s_recentWinner;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    function getNumWords() public pure returns (uint256) { 
        //since it is reading from constant and not from storage we can make it as pure fn
        return NUM_WORDS;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLastTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }

    function getRequestConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS;
    }

    function getVrfCoordinatorAddress() public view returns(VRFCoordinatorV2Interface){
        return i_vrfCoordinator;
    }
}
