// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Base.sol";


abstract contract Rewarding is Base
{
    using EnumerableSet for EnumerableSet.AddressSet;

    error ExpiredPool();

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

    uint256 rewardPoolsCount = 0;
    mapping (uint256 => RewardPool) public rewardPools;

    EnumerableSet.AddressSet private _stakers;

    uint64 public rewardPoolsUpdatedAt;



    /**
     * Owner access
     */
    function createRewardsPool(
        address rewardToken,
        uint256 amount,
        uint64 timespan
    ) public onlyOwner
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
        rewardPool.expiresAt = uint64(block.timestamp + timespan);
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
     * Assignment to new pools
     */
    function _assignUserToNewPool(uint256 pid, address staker) private
    {
        uint256 stake = balanceOf(staker);
        if (stake == 0) {
            // this account has no stake - skip
            return;
        }

        if (rewardPools[pid].shares[staker] > 0) {
            // this account has existing share in new pool - skip
            return;
        }

        _enterRewardPool(pid, staker, stake);
    }

    function assignMeToNewPool(uint256 pid) public
        updateRewards
    {
        _assignUserToNewPool(pid, msg.sender);
    }

    function assignAllToNewPool(uint256 pid) public
        onlyOwner
        updateRewards
    {
        for (uint256 si = 0; si < _stakers.length(); ++si) {
            address staker = _stakers.at(si);
            _assignUserToNewPool(pid, staker);
        }
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
     * Modifiers
     */
    modifier updateRewards()
    {
        _updateAllRewardPools();
        _;
    }

    modifier rewardingStakeModifier(uint256 amount)
    {
        _updateAllRewardPools();

        for (uint256 pid = 0; pid < rewardPoolsCount; ++pid) {
            // enter reward pools with given amount
            _enterRewardPool(pid, msg.sender, amount);
        }

        _stakers.add(msg.sender);

        _;
    }

    modifier rewardingWithdrawModifier()
    {
        _updateAllRewardPools();

        uint256 stakeAmount = balanceOf(msg.sender);

        for (uint256 pid = 0; pid < rewardPoolsCount; ++pid) {
            // it is important to claim rewards before further balance updates
            _claimRewards(pid);

            // exit with stake from reward pools
            _exitRewardPool(pid, msg.sender, stakeAmount);
        }

        _stakers.remove(msg.sender);

        _;
    }


    /**
     * Enter reward pools with given amount of stake
     */
    function _enterRewardPool(
        uint256 pid,
        address account,
        uint256 amount
    ) internal
    {
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

    /**
     * Exit from reward pools with given amount of stake or rewards
     */
    function _exitRewardPool(
        uint256 pid,
        address account,
        uint256 amount
    ) internal
    {
        RewardPool storage rewardPool = rewardPools[pid];

        uint256 share;
        if (rewardPool.accumulator == 0) {
            share = amount;
        }
        else {
            share = amount * rewardPool.totalShares / rewardPool.accumulator;
        }

        rewardPool.shares[account] -= share;
        rewardPool.totalShares -= share;

        rewardPool.accumulator -= amount;
    }


    /**
     * Calculate updated accumulator
     */
    function _calcUpdatedAccumulator(uint256 pid) internal view returns (uint256, uint256)
    {
        RewardPool storage rewardPool = rewardPools[pid];

        uint256 accumulator = rewardPool.accumulator;

        uint64 deltaTime = uint64(block.timestamp) - rewardPoolsUpdatedAt;
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
     * Rewards claiming
     */
    function valueOf(
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
        uint256 accountValue = valueOf(pid, account);
        if (balanceOf(account) > accountValue) {
            return 0;
        }

        return accountValue - balanceOf(account);
    }


    function _claimRewards(uint256 pid) internal virtual
    {
        RewardPool storage rewardPool = rewardPools[pid];

        uint256 amount = claimableRewardsOf(pid, msg.sender);
        if (amount == 0) {
            return;
        }

        // update shares
        _exitRewardPool(pid, msg.sender, amount);

        // transfer rewards
        rewardPool.token.transfer(msg.sender, amount);

        emit RewardsClaimed(pid, address(rewardPool.token), amount);
    }

    function claimRewards(uint256 pid) public
        updateRewards
    {
        if (pid >= rewardPoolsCount) {
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
