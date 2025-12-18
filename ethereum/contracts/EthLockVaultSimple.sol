// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract EthLockVault {
    struct Deposit {
        address depositor;
        uint256 amount;
        string toChain;
        string recipient;
    }

    mapping(uint256 => Deposit) public deposits;
    uint256 public nextSwapId;

    event DepositInitiated(
        uint256 indexed swapId,
        address indexed depositor,
        uint256 amount,
        string toChain,
        string recipient
    );

    function deposit(string calldata toChain, string calldata recipient) external payable returns (uint256) {
        require(msg.value > 0, "Must send ETH");
        
        uint256 swapId = nextSwapId;
        nextSwapId++;

        deposits[swapId] = Deposit({
            depositor: msg.sender,
            amount: msg.value,
            toChain: toChain,
            recipient: recipient
        });

        emit DepositInitiated(swapId, msg.sender, msg.value, toChain, recipient);
        return swapId;
    }
}
