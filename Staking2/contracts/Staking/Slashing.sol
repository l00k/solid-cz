// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Rewarding.sol";


abstract contract Slashing is Rewarding
{

    event RewardsSlashed(uint256 poolIdx, uint256 amount);


    struct StakeRecord {
        uint64 time;
        uint256 amount;
    }


    uint64 public minimalStakeTime = 7 days;
    uint256 public slashRatePermill = 1e5;

    mapping(address => StakeRecord[]) public stakeRecords;


    /**
     * @dev
     * Modify minimal stake time
     */
    function changeSlashingParams(
        uint64 minimalStakeTime_,
        uint256 slashRatePermill_
    ) public onlyOwner
    {
        minimalStakeTime = minimalStakeTime_;
        slashRatePermill = slashRatePermill_;
    }

    /**
     * @dev
     * Stake modifier
     */
    modifier slashingStakeModifier(uint256 amount)
    {
        _;

        stakeRecords[msg.sender].push(StakeRecord(
            uint64(block.timestamp),
            amount
        ));
    }

    /**
     * @dev
     * Withdrawal modifier
     */
    modifier slashingWithdrawModifier()
    {
        _slashRewardsIfRequired();

        _;

        // delete stake records
        delete stakeRecords[msg.sender];
    }

    /**
     * @dev
     * Slash rewards
     */
    function _slashRewardsIfRequired() internal
    {
        uint256 stakeAmountToSlash = 0;
        uint256 totalStakeAmount = 0;

        StakeRecord[] storage records = stakeRecords[msg.sender];

        for (uint256 i = 0; i < records.length; ++i) {
            uint64 deltaTime = uint64(block.timestamp) - records[i].time;
            if (deltaTime < minimalStakeTime) {
                stakeAmountToSlash += records[i].amount;
            }

            totalStakeAmount += records[i].amount;
        }

        if (stakeAmountToSlash > 0) {
            // reduce distributed rewards
            for (uint256 poolIdx = 0; poolIdx < rewardPools.length; ++poolIdx) {
                uint256 amount = _distributedRewards[msg.sender][poolIdx]
                    * (stakeAmountToSlash / totalStakeAmount)
                    * (slashRatePermill / 1e6);

                _distributedRewards[msg.sender][poolIdx] -= amount;

                emit RewardsSlashed(poolIdx, amount);
            }
        }
    }

}
