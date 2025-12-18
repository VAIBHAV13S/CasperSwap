// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract EthLockVault is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    struct Deposit {
        address depositor;
        address token;
        uint256 amount;
        string toChain;
        string recipient;
        bool active;
    }

    mapping(bytes32 => Deposit) public deposits;
    mapping(bytes32 => bool) public processedSwaps;
    mapping(address => bool) public relayers;
    uint256 public nextSwapId;

    event DepositInitiated(bytes32 indexed swapId, address indexed depositor, string toChain, address token, uint256 amount, string recipient);
    event ReleaseExecuted(bytes32 indexed swapId, address indexed recipient, uint256 amount, address token);

    constructor() Ownable(msg.sender) {}

    function registerRelayer(address relayer) external onlyOwner {
        relayers[relayer] = true;
    }

    function deposit(string calldata toChain, address token, string calldata recipient, uint256 amount) external returns (bytes32) {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        
        bytes32 swapId = keccak256(abi.encodePacked(msg.sender, block.timestamp, nextSwapId));
        nextSwapId++;

        deposits[swapId] = Deposit({
            depositor: msg.sender,
            token: token,
            amount: amount,
            toChain: toChain,
            recipient: recipient,
            active: true
        });

        emit DepositInitiated(swapId, msg.sender, toChain, token, amount, recipient);
        return swapId;
    }

    function release(bytes32 swapId, address recipient, uint256 amount, address token, bytes calldata signature) external {
        require(!processedSwaps[swapId], "Swap already processed");
        
        bytes32 messageHash = keccak256(abi.encodePacked(swapId, recipient, amount, token));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        
        address signer = ethSignedMessageHash.recover(signature);
        require(relayers[signer], "Invalid relayer signature");

        processedSwaps[swapId] = true;
        IERC20(token).transfer(recipient, amount);

        emit ReleaseExecuted(swapId, recipient, amount, token);
    }
}
