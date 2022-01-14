// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


error OnlyMasterOwnerAllowed();
error OnlyOwnerAllowed();
error WrongAccount();


contract Ownable
{

    event OwnershipGranted(address addr);
    event OwnershipRevoked(address addr);
    event MasterOwnershipChanged(address from, address to);


    address private _masterOwner;
    mapping(address => bool) private _owners;


    constructor() {
        _masterOwner = msg.sender;
        _owners[msg.sender] = true;
    }

    modifier masterOwnerOnly()
    {
        if (msg.sender != _masterOwner) {
            revert OnlyMasterOwnerAllowed();
        }
        _;
    }

    modifier ownerOnly()
    {
        if (!_owners[msg.sender]) {
            revert OnlyOwnerAllowed();
        }
        _;
    }

    function masterOwner() public view returns (address)
    {
        return _masterOwner;
    }

    function isOwner(address addr_) public view returns (bool)
    {
        return _owners[addr_];
    }

    function changeMasterOwnership(address target_) external masterOwnerOnly
    {
        _masterOwner = target_;
        _owners[target_] = true;

        emit MasterOwnershipChanged(msg.sender, target_);
    }

    function addOwner(address target_) external masterOwnerOnly
    {
        if (_owners[target_]) {
            // already is a owner
            return;
        }

        _owners[target_] = true;

        emit OwnershipGranted(target_);
    }

    function revokeOwner(address target_) external masterOwnerOnly
    {
        if (!_owners[target_]) {
            // not owner
            revert WrongAccount();
        }

        _owners[target_] = false;

        emit OwnershipRevoked(target_);
    }


}
