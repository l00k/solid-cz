// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Feeding} from "./Feeding.sol";


error ZombieLevelTooLow(uint256 levelRequired, uint256 actualLevel);
error WrongFeeAmount(uint256 feeRequired, uint256 appliedFee);


contract Pay2Win is Feeding
{

    uint256 levelUpFee = 0.001 ether;


    modifier aboveLevel(uint256 _level, uint256 _zombieId)
    {
        if (zombies[_zombieId].level < _level) {
            revert ZombieLevelTooLow(_level, zombies[_zombieId].level);
        }
        _;
    }

    function withdraw() external payable onlyOwner
    {
        address payable _owner = payable(owner());
        _owner.transfer(address(this).balance);
    }

    function setLevelUpFee(uint256 _fee) external onlyOwner
    {
        levelUpFee = _fee;
    }

    function levelUp(uint256 _zombieId) external payable
    {
        if (msg.value != levelUpFee) {
            revert WrongFeeAmount(levelUpFee, msg.value);
        }

        zombies[_zombieId].level = zombies[_zombieId].level + 1;
    }

    function changeName(
        uint256 _zombieId,
        string calldata _newName
    ) external
        aboveLevel(2, _zombieId)
        onlyOwnerOf(_zombieId)
    {
        zombies[_zombieId].name = _newName;
    }

    function changeDna(
        uint256 _zombieId,
        uint256 _newDna
    ) external
        aboveLevel(20, _zombieId)
        onlyOwnerOf(_zombieId)
    {
        zombies[_zombieId].dna = _newDna;
    }

}
