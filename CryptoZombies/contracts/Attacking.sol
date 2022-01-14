// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Pay2Win} from "./Pay2Win.sol";
import {ZombieIsNotReady} from "./Feeding.sol";


error WrongAttackTarget(uint targetId, uint attackId);

contract Attacking is Pay2Win
{

    uint256 attackVictoryProbability = 70;


    function attack(uint256 _zombieId, uint256 _targetId) external onlyOwnerOf(_zombieId)
    {
        if (_zombieId == _targetId) {
            revert WrongAttackTarget(_targetId, _zombieId);
        }

        Zombie storage myZombie = zombies[_zombieId];
        if (!_isReady(myZombie)) {
            revert ZombieIsNotReady(_zombieId);
        }

        Zombie storage enemyZombie = zombies[_targetId];

        uint256 rand = _generateRandom("fight") % 100;
        if (rand < attackVictoryProbability) {
            ++myZombie.winCount;
            ++myZombie.level;
            ++enemyZombie.lossCount;

            feedAndMultiply(_zombieId, enemyZombie.dna, "zombie");
        }
        else {
            ++myZombie.lossCount;
            ++enemyZombie.winCount;
            _triggerCooldown(myZombie);
        }
    }

}
