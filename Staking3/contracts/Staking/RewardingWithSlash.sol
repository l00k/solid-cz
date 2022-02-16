// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Rewarding.sol";


import "hardhat/console.sol";


abstract contract RewardingWithSlash is Rewarding
{

    event SlashingParamsChanged(uint64 minimalStakeTime, uint256 slashRatePermill);
    event RewardsSlashed(uint256 poolIdx, uint256 amount);


    struct StakeRecord {
        uint64 time;
        uint256 amount;
    }


    uint64 public minimalStakeTime = 7 days;
    uint256 public slashRatePermill = 0;

    mapping(address => StakeRecord[]) public stakeRecords;


    /**
     * Owner actions
     */
    function changeSlashingParams(
        uint64 minimalStakeTime_,
        uint256 slashRatePermill_
    ) public onlyOwner
    {
        minimalStakeTime = minimalStakeTime_;
        slashRatePermill = slashRatePermill_;

        emit SlashingParamsChanged(minimalStakeTime, slashRatePermill);
    }


    /**
     * Modified version of Rewarding::claimableRewardsOf()
     * Reduces rewards by slash factor
     */
    function claimableRewardsOf(
        uint256 pid,
        address account
    ) public view override returns (uint256)
    {
        uint256 claimableRewards = Rewarding.claimableRewardsOf(pid, account);
        if (claimableRewards == 0 || slashRatePermill == 0) {
            return claimableRewards;
        }

        uint256 slashRate = calcSlashRate(account);
        return claimableRewards * (1e18 - slashRate) / 1e18;
    }

    function slashableRewardsOf(
        uint256 pid,
        address account
    ) public view returns (uint256)
    {
        uint256 slashRate = calcSlashRate(account);
        if (slashRate == 0) {
            return 0;
        }

        uint256 claimableRewards = Rewarding.claimableRewardsOf(pid, account);
        if (claimableRewards == 0) {
            return 0;
        }

        return claimableRewards * (1e18 - slashRate) / 1e18;
    }


    /**
     * Returns ratio (x / 1e18) of potential slash
     */
    function calcSlashRate(address account) public view returns (uint256)
    {
        uint256 stakeAmountToSlash = 0;
        uint256 totalStakeAmount = 0;

        StakeRecord[] storage records = stakeRecords[account];

        for (uint256 i = 0; i < records.length; ++i) {
            uint64 deltaTime = uint64(block.timestamp) - records[i].time;
            if (deltaTime < minimalStakeTime) {
                stakeAmountToSlash += records[i].amount;
            }

            totalStakeAmount += records[i].amount;
        }

        if (totalStakeAmount == 0) {
            return 0;
        }

        // (stakeAmountToSlash / totalStakeAmount) * (slashRatePermill / 1e6) * 1e18
        return stakeAmountToSlash * slashRatePermill * 1e12 / totalStakeAmount;
    }


    /**
     * Modifiers
     */
    modifier slashingStakeModifier(uint256 amount)
    {
        _;

        stakeRecords[msg.sender].push(StakeRecord(
            uint64(block.timestamp),
            amount
        ));
    }

    modifier slashingWithdrawModifier()
    {
        _;

        if (slashRatePermill > 0) {
            _moveSlashedAmountToPool();
        }

        // delete stake records
        delete stakeRecords[msg.sender];
    }


    function _moveSlashedAmountToPool() internal
    {

        for (uint pid = 0; pid < rewardPoolsCount; ++pid) {
            RewardPool storage rewardPool = rewardPools[pid];

            if (rewardPool.totalShares == 0) {
                continue;
            }

            uint256 valueLeft = rewardPool.shares[msg.sender] * rewardPool.accumulator / rewardPool.totalShares;

            // clear shares
            rewardPool.totalShares -= rewardPool.shares[msg.sender];
            rewardPool.shares[msg.sender] = 0;

            // move value left to pool
            rewardPool.accumulator -= valueLeft;
            rewardPool.unspentAmount += valueLeft;

            emit RewardsSlashed(pid, valueLeft);
        }
    }


}
