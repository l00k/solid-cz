// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Base.sol";


import "hardhat/console.sol";



abstract contract Rewarding is Base
{

    // Add this extra time to reward pool time
    // in order to prevent unspent rewards left in pool
    // Rewards distribution is capped with pool unspent amount so no security issue here
    uint public constant EXTRA_TIME = 100;


    error ExpiredPool();
    error AlreadyStarted();

    event RewardPoolCreated(uint256 pid, address rewardToken, uint256 amount, uint256 timespan);
    event RewardPoolModified(uint256 pid, uint256 amount, uint256 timespan);

    event RewardsClaimed(uint256 pid, address rewardToken, uint256 amount);


    struct RewardPool {
        ERC20 token;

        uint256 unspentAmount;

        uint64 timespan;
        uint64 expiresAt;

        uint256 rewardsRate;

        mapping(address => uint256) shares;
        uint256 totalShares;

        uint256 accumulator;
    }

    bool public started = false;

    uint256 rewardPoolsCount = 0;
    mapping (uint256 => RewardPool) public rewardPools;

    uint64 public rewardPoolsUpdatedAt;



    /**
     * Owner access
     */
    function createRewardsPool(
        address rewardToken,
        uint256 amount,
        uint64 timespan
    ) public onlyOwner beforeStart
    {
        if (amount == 0) {
            revert InvalidArgument();
        }
        if (timespan == 0) {
            revert InvalidArgument();
        }

        ERC20 token = ERC20(rewardToken);

        // check current allowance on given token
        uint256 allowance = token.allowance(msg.sender, address(this));
        if (allowance < amount) {
            revert InsufficientAllowance(amount, allowance);
        }

        token.transferFrom(msg.sender, address(this), amount);

        // create new pool
        uint256 rewardsRate = amount / timespan;

        uint256 pid = rewardPoolsCount++;
        RewardPool storage rewardPool = rewardPools[pid];

        rewardPool.token = token;
        rewardPool.unspentAmount = amount;
        rewardPool.timespan = timespan;
        rewardPool.expiresAt = uint64(block.timestamp + timespan + EXTRA_TIME);
        rewardPool.rewardsRate = rewardsRate;

        emit RewardPoolCreated(
            pid,
            rewardToken,
            amount,
            timespan
        );
    }

    function _modifyRewardPool(uint256 pid, uint256 timespan) internal
    {
        RewardPool storage rewardPool = rewardPools[pid];

        if (rewardPool.expiresAt <= block.timestamp) {
            revert ExpiredPool();
        }

        // recalculate reward per second
        rewardPool.rewardsRate = rewardPool.unspentAmount / timespan;
        rewardPool.expiresAt = uint64(block.timestamp + timespan + EXTRA_TIME);

        emit RewardPoolModified(pid, rewardPool.unspentAmount, timespan);
    }

    function modifyRewardPool(uint256 pid, uint256 timespan) public
        onlyOwner
        updateRewards
    {
        if (timespan == 0) {
            revert InvalidArgument();
        }
        if (pid >= rewardPoolsCount) {
            revert InvalidArgument();
        }

        _modifyRewardPool(pid, timespan);
    }

    function modifyAllRewardPools(uint256 timespan) public
        onlyOwner
        updateRewards
    {
        if (timespan == 0) {
            revert InvalidArgument();
        }

        for (uint256 pid = 0; pid < rewardPoolsCount; ++pid) {
            _modifyRewardPool(pid, timespan);
        }
    }

    /**
     * Modifiers
     */
    modifier beforeStart()
    {
        if (started) {
            revert AlreadyStarted();
        }
        _;
    }

    modifier updateRewards()
    {
        _updateAllRewardPools();
        _;
    }

    modifier rewardingStakeModifier(uint256 amount)
    {
        _updateAllRewardPools();
        _enterRewardPools(msg.sender, amount);

        started = true;

        _;
    }

    modifier rewardingWithdrawModifier()
    {
        _updateAllRewardPools();
        _;

        // claim rewards after rewards
        for (uint256 pid = 0; pid < rewardPoolsCount; ++pid) {
            _claimRewards(pid);
        }
    }

    /**
     *
     */
    function _enterRewardPools(address account, uint256 amount) internal
    {
        for (uint256 pid = 0; pid < rewardPoolsCount; ++pid) {
            RewardPool storage rewardPool = rewardPools[pid];

            uint256 share;
            if (rewardPool.accumulator == 0) {
                share = amount;
            }
            else {
                share = amount * rewardPool.totalShares / rewardPool.accumulator;
            }

            rewardPool.shares[account] += share;
            rewardPool.totalShares += share;

            rewardPool.accumulator += amount;
        }
    }

    function _normalizeShare(
        uint256 amount,
        uint8 decimals
    ) public pure returns (uint256)
    {
        uint256 pow = 10 ** (24 - decimals);
        return amount * pow;
    }


    /**
     * Calculate updated accumulator
     */
    function _calcUpdatedAccumulator(uint256 pid) internal view returns (uint256, uint256)
    {
        RewardPool storage rewardPool = rewardPools[pid];

        uint256 accumulator = rewardPool.accumulator;

        uint64 endTime = uint64(Math.min(rewardPool.expiresAt, block.timestamp));
        uint64 deltaTime = endTime - rewardPoolsUpdatedAt;

        if (deltaTime == 0) {
            return (accumulator, 0);
        }

        uint256 distribution = rewardPool.rewardsRate * deltaTime;
        if (distribution > rewardPool.unspentAmount) {
            // reduce distribution to unspent amount limit
            distribution = rewardPool.unspentAmount;
        }

        accumulator += distribution;

        return (accumulator, distribution);
    }

    /**
     * Update reward pool
     */
    function _updateRewardPool(uint256 pid) internal
    {
        RewardPool storage rewardPool = rewardPools[pid];

        if (uint64(block.timestamp) > rewardPool.expiresAt) {
            return;
        }

        if (rewardPoolsUpdatedAt == 0) {
            rewardPoolsUpdatedAt = uint64(block.timestamp);
            return;
        }

        // update accumulator based on time delta
        (uint256 accumulator, uint256 distribution) = _calcUpdatedAccumulator(pid);
        rewardPool.accumulator = accumulator;
        rewardPool.unspentAmount -= distribution;
    }

    function _updateAllRewardPools() internal
    {
        for (uint256 pid = 0; pid < rewardPoolsCount; ++pid) {
            _updateRewardPool(pid);
        }

        rewardPoolsUpdatedAt = uint64(block.timestamp);
    }


    /**
     * Staker views
     */
    function stakerShare(
        uint256 pid,
        address account
    ) public view returns(uint256)
    {
        RewardPool storage rewardPool = rewardPools[pid];
        return rewardPool.shares[account];
    }

    function stakerShareRatio(
        uint256 pid,
        address account
    ) public view returns(uint256)
    {
        RewardPool storage rewardPool = rewardPools[pid];
        if (rewardPool.accumulator == 0) {
            return 0;
        }

        return rewardPool.shares[account] * 1e18 / rewardPool.totalShares;
    }


    /**
     * Rewards claiming
     */
    function withdrawableOf(
        uint256 pid,
        address account
    ) public view returns (uint256)
    {
        RewardPool storage rewardPool = rewardPools[pid];

        (uint256 accumulator,) = _calcUpdatedAccumulator(pid);
        uint256 withdrawable = rewardPool.totalShares > 0
            ? rewardPool.shares[account] * accumulator / rewardPool.totalShares
            : rewardPool.shares[account];

        return withdrawable;
    }

    function claimableRewardsOf(
        uint256 pid,
        address account
    ) public view virtual returns (uint256)
    {
        uint256 withdrawable = withdrawableOf(pid, account);
        if (balanceOf(account) > withdrawable) {
            return 0;
        }

        return withdrawable - balanceOf(account);
    }


    function _claimRewards(uint256 pid) internal virtual
    {
        RewardPool storage rewardPool = rewardPools[pid];

        uint256 amount = claimableRewardsOf(pid, msg.sender);
        if (amount == 0) {
            return;
        }

        // update shares
        (uint256 accumulator,) = _calcUpdatedAccumulator(pid);
        uint256 sharesDelta = amount * rewardPool.totalShares / accumulator;
        rewardPool.shares[msg.sender] -= sharesDelta;
        rewardPool.totalShares -= sharesDelta;

        // transfer rewards
        rewardPool.token.transfer(msg.sender, amount);

        emit RewardsClaimed(pid, address(rewardPool.token), amount);
    }

    function claimRewards(uint256 pid) public
        updateRewards
    {
        if (pid > rewardPoolsCount) {
            revert InvalidArgument();
        }

        _claimRewards(pid);
    }

    function claimAllRewards() public
        updateRewards
    {
        for (uint256 p = 0; p < rewardPoolsCount; ++p) {
            _claimRewards(p);
        }
    }

}
