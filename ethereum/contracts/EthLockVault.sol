// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract EthLockVault is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    struct Deposit {
        address depositor;
        uint256 amount;
        string toChain;
        string recipient;
        bool active;
    }

    mapping(uint256 => Deposit) public deposits;
    mapping(uint256 => bool) public processedSwaps;
    mapping(address => bool) public relayers;
    uint256 public nextSwapId;

    event DepositInitiated(uint256 indexed swapId, address indexed depositor, uint256 amount, string toChain, string recipient);
    event ReleaseExecuted(uint256 indexed swapId, address indexed recipient, uint256 amount);

    constructor() Ownable(msg.sender) {}

    function registerRelayer(address relayer) external onlyOwner {
        relayers[relayer] = true;
    }

    function deposit(string calldata toChain, string calldata recipient) external payable returns (uint256) {
        require(msg.value > 0, "Invalid amount");

        uint256 swapId = nextSwapId;
        nextSwapId++;

        deposits[swapId] = Deposit({
            depositor: msg.sender,
            amount: msg.value,
            toChain: toChain,
            recipient: recipient,
            active: true
        });

        emit DepositInitiated(swapId, msg.sender, msg.value, toChain, recipient);
        return swapId;
    }

    function release(uint256 swapId, address recipient, uint256 amount, bytes calldata signature) external {
        require(!processedSwaps[swapId], "Swap already processed");
        
        bytes32 messageHash = keccak256(abi.encodePacked(swapId, recipient, amount));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        
        address signer = ethSignedMessageHash.recover(signature);
        require(relayers[signer], "Invalid relayer signature");

        processedSwaps[swapId] = true;
        (bool ok, ) = payable(recipient).call{ value: amount }("");
        require(ok, "Transfer failed");

        emit ReleaseExecuted(swapId, recipient, amount);
    }
}
