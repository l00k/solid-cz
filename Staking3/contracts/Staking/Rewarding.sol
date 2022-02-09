// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Base.sol";


abstract contract Rewarding is Base
{

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

        uint256 rewardsRatio;

        mapping(address => uint256) shares;
        uint256 totalShares;

        uint256 accumulator;

        mapping(address => uint256) claimedAmount;
    }

    bool public started = false;

    RewardPool[] public rewardPools;
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
        uint256 rewardsRatio = amount / timespan;

        uint256 pid = rewardPools.length;
        RewardPool storage rewardPool = rewardPools[pid];

        rewardPool.token = token;
        rewardPool.unspentAmount = amount;
        rewardPool.timespan = timespan;
        rewardPool.expiresAt = uint64(block.timestamp + timespan);
        rewardPool.rewardsRatio = rewardsRatio;

        emit RewardPoolCreated(
            rewardPools.length - 1,
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
        rewardPool.rewardsRatio = rewardPool.unspentAmount / timespan;
        rewardPool.expiresAt = uint64(block.timestamp + timespan);

        emit RewardPoolModified(pid, rewardPool.unspentAmount, timespan);
    }

    function modifyRewardPool(uint256 pid, uint256 timespan) public
        onlyOwner
        updateRewards
    {
        if (timespan == 0) {
            revert InvalidArgument();
        }
        if (pid >= rewardPools.length) {
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

        for (uint256 pid = 0; pid < rewardPools.length; ++pid) {
            _modifyRewardPool(pid, timespan);
        }
    }


    /**
     * Views
     */
    function stakerShareRatio(uint256 pid, address account) public view returns(uint256)
    {
        RewardPool storage rewardPool = rewardPools[pid];
        return rewardPool.shares[account] * 1e18 / rewardPool.totalShares;
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
        _updateRewardPools();
        _;
    }

    modifier rewardingStakeModifier(uint256 amount)
    {
        _updateRewardPools();
        _;
    }

    modifier rewardingWithdrawModifier()
    {
        _updateRewardPools();
        _;

        // claim rewards after rewards
        for (uint256 p = 0; p < rewardPools.length; ++p) {
            _claimRewards(p);
        }
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

        uint64 deltaTime = rewardPoolsUpdatedAt - uint64(block.timestamp);
        if (deltaTime == 0) {
            return;
        }

        uint256 distribution = deltaTime * rewardPool.rewardsRatio;
        if (distribution > rewardPool.unspentAmount) {
            distribution = rewardPool.unspentAmount;
        }

        rewardPool.accumulator += distribution;
        rewardPool.unspentAmount -= distribution;
    }

    function _updateRewardPools() internal
    {
        for (uint256 pid = 0; pid < rewardPools.length; ++pid) {
            _updateRewardPool(pid);
        }

        rewardPoolsUpdatedAt = uint64(block.timestamp);
    }


    /**
     * Rewards claiming
     */
    function claimableRewardsOf(
        uint256 pid,
        address account
    ) public view virtual returns (uint256)
    {
        RewardPool storage rewardPool = rewardPools[pid];

        uint256 totalEarned = rewardPool.shares[account] * rewardPool.accumulator / rewardPool.totalShares;

        return totalEarned - rewardPool.claimedAmount[account];
    }

    function _claimRewards(uint256 pid) internal virtual
    {
        RewardPool storage rewardPool = rewardPools[pid];

        uint256 amount = claimableRewardsOf(pid, msg.sender);
        if (amount == 0) {
            return;
        }

        rewardPool.token.transfer(msg.sender, amount);

        emit RewardsClaimed(pid, address(rewardPool.token), amount);
    }

    function claimRewards(uint256 pid) public
        updateRewards
    {
        if (pid > rewardPools.length) {
            revert InvalidArgument();
        }

        _claimRewards(pid);
    }

    function claimAllRewards() public
        updateRewards
    {
        for (uint256 p = 0; p < rewardPools.length; ++p) {
            _claimRewards(p);
        }
    }

}
