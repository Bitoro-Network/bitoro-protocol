// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DemoBridge is Ownable {
    // Mapping to keep track of token balances on this chain
    mapping(address => uint256) public tokenBalances;

    // Mapping to track the bridge participants
    mapping(address => bool) public isParticipant;

    // Event to log token transfers
    event TokenTransfer(address indexed from, address indexed to, address indexed tokenAddress, uint256 amount);

    constructor() {}

    // Add an address as a participant
    function addParticipant(address participant) external onlyOwner {
        isParticipant[participant] = true;
    }

    // Remove an address from participants
    function removeParticipant(address participant) external onlyOwner {
        isParticipant[participant] = false;
    }

    // Transfer tokens from one network to another
    function transferTokens(uint256 bridgeId, address to, address tokenAddress, uint256 amount) external {
        require(isParticipant[msg.sender], "Only participants can transfer tokens");

        // Ensure the token balance is sufficient
        require(tokenBalances[tokenAddress] >= amount, "Insufficient token balance on this chain");

        // Transfer tokens to the recipient
        IERC20(tokenAddress).transfer(to, amount);

        // Update the token balance
        tokenBalances[tokenAddress] -= amount;

        // Log the token transfer
        emit TokenTransfer(msg.sender, to, tokenAddress, amount);
    }

    // Deposit tokens into the bridge contract on this chain
    function depositTokens(address tokenAddress, uint256 amount) external {
        // Transfer tokens from the sender to this contract
        IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount);

        // Update the token balance
        tokenBalances[tokenAddress] += amount;
    }

    // Retrieve the token balance on this chain
    function getTokenBalance(address tokenAddress) external view returns (uint256) {
        return tokenBalances[tokenAddress];
    }
}
