// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Rewarding.sol";


abstract contract RewardingWithSlash is Rewarding
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
     * Owner actions
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
     * Modified version of Rewarding::claimableRewardsOf()
     * Reduces rewards by slash factor
     */
    function claimableRewardsOf(
        uint256 pid,
        address account
    ) public view override returns (uint256)
    {
        uint256 claimableRewards = Rewarding.claimableRewardsOf(pid, account);
        uint256 slashRate = calcSlashRate(account);

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

        // (stakeAmountToSlash / totalStakeAmount) * (slashRatePermill / 1e6) * 1e18
        return stakeAmountToSlash * slashRatePermill * 1e12 / totalStakeAmount;
    }


    /**
     * Modified version of rewards claiming
     * Rewards are reduced by potential slash rate
     */
    function _claimRewards(uint256 pid) internal override
    {
        RewardPool storage rewardPool = rewardPools[pid];

        uint256 claimableRewards = claimableRewardsOf(pid, msg.sender);
        if (claimableRewards == 0) {
            return;
        }

        rewardPool.token.transfer(msg.sender, claimableRewards);

        emit RewardsClaimed(pid, address(rewardPool.token), claimableRewards);
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
        _slashRewards();

        _;

        // delete stake records
        delete stakeRecords[msg.sender];
    }


    function _slashRewards() internal
    {
        uint256 slashRate = calcSlashRate(msg.sender);
        if (slashRate == 0) {
            return;
        }

        for (uint pid = 0; pid < rewardPools.length; ++pid) {
            uint256 claimableRewards = Rewarding.claimableRewardsOf(pid, msg.sender);
            if (claimableRewards == 0) {
                continue;
            }

            RewardPool storage rewardPool = rewardPools[pid];

            // reduce rewards
            uint256 slashAmount = claimableRewards * (1e18 - slashRate) / 1e18;
            claimableRewards -= slashAmount;

            // move slashed amount to pool balance
            rewardPool.unspentAmount += slashAmount;

            emit RewardsSlashed(pid, slashAmount);
        }
    }


}
