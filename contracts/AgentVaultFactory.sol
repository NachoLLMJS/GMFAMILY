// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AgentVault} from "./AgentVault.sol";

interface IIdentityRegistryOwner {
    function ownerOf(uint256 agentId) external view returns (address);
}

/// @notice Creates one non-custodial vault per ERC-8004 identity owner.
/// @dev Vault funds never transfer implicitly with the identity NFT. A later identity owner creates a separate vault.
contract AgentVaultFactory {
    error UnauthorizedAgentOwner();
    error VaultAlreadyExists();
    error InvalidRegistry();

    IIdentityRegistryOwner public immutable identityRegistry;
    mapping(uint256 => mapping(address => address)) public vaultByOwner;
    mapping(address => bool) public isVault;

    event VaultCreated(uint256 indexed agentId, address indexed owner, address indexed executor, address vault);

    constructor(address registry) {
        if (registry.code.length == 0) revert InvalidRegistry();
        identityRegistry = IIdentityRegistryOwner(registry);
    }

    /// @notice Returns the vault belonging to the identity's current owner, or zero if that owner has not created one.
    function vaultOf(uint256 agentId) public view returns (address) {
        return vaultByOwner[agentId][identityRegistry.ownerOf(agentId)];
    }

    function createVault(uint256 agentId, address executor) external returns (address vault) {
        if (identityRegistry.ownerOf(agentId) != msg.sender) revert UnauthorizedAgentOwner();
        if (vaultByOwner[agentId][msg.sender] != address(0)) revert VaultAlreadyExists();
        vault = address(new AgentVault(msg.sender, agentId, executor));
        vaultByOwner[agentId][msg.sender] = vault;
        isVault[vault] = true;
        emit VaultCreated(agentId, msg.sender, executor, vault);
    }
}
