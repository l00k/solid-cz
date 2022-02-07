// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Base.sol";


abstract contract Rewarding is Base
{

    error WrongTimespan();
    error InvalidPool();

    event RewardPoolCreated(uint256 poolIdx, address rewardToken, uint256 amount, uint64 timespan);
    event RewardPoolModified(uint256 poolIdx, uint256 amount, uint64 timespan);

    event RewardsClaimed(uint256 poolIdx, address rewardToken, uint256 amount);


    struct RewardPool {
        ERC20 token;

        uint256 unspentAmount;
        uint256 rewardRatio;

        uint64 timespan;
        uint64 lastDistributionAt;
        uint64 expiresAt;

        uint256 rewardsPerTokenAcc;
    }


    RewardPool[] public rewardPools;

    mapping(address => mapping(uint256 => uint256)) private _rewardsPerTokenPaid;
    mapping(address => mapping(uint256 => uint256)) private _distributedRewards;



    /**
     * @dev
     * Owner endpoint for creating new reward pools
     */
    function createRewardsPool(
        address rewardToken,
        uint256 amount,
        uint64 timespan
    ) public onlyOwner
    {
        if (amount == 0) {
            revert WrongAmount();
        }
        if (timespan == 0) {
            revert WrongTimespan();
        }

        ERC20 token = ERC20(rewardToken);

        // check current allowance on given token
        uint256 allowance = token.allowance(msg.sender, address(this));
        if (allowance < amount) {
            revert InsufficientAllowance(amount, allowance);
        }

        // transfer funds
        token.transferFrom(msg.sender, address(this), amount);

        // calculate reward per second
        uint256 rewardRatio = amount / timespan;

        // create new pool
        rewardPools.push(RewardPool(
            token,
            amount,
            rewardRatio,
            timespan,
            totalSupply() > 0 ? uint64(block.timestamp) : 0,
            totalSupply() > 0 ? uint64(block.timestamp) + timespan : 0,
            0
        ));

        emit RewardPoolCreated(rewardPools.length - 1, address(token), amount, timespan);
    }


    function modifyRewardPool(
        uint256 poolIdx,
        uint64 timespan
    ) public onlyOwner
    {
        if (timespan == 0) {
            revert WrongTimespan();
        }
        if (poolIdx >= rewardPools.length) {
            revert InvalidPool();
        }

        RewardPool storage rewardPool = rewardPools[poolIdx];

        if (rewardPool.expiresAt != 0 && rewardPool.expiresAt < block.timestamp) {
            revert InvalidPool();
        }

        // update reward pools
        _updateRewardPools();

        // recalculate reward per second
        rewardPool.rewardRatio = rewardPool.unspentAmount / timespan;
        rewardPool.expiresAt = uint64(block.timestamp) + timespan;

        emit RewardPoolModified(poolIdx, rewardPool.unspentAmount, timespan);
    }


    function modifyAllRewardPools(uint64 timespan) public onlyOwner
    {
        if (timespan == 0) {
            revert WrongTimespan();
        }

        for (uint256 p = 0; p < rewardPools.length; ++p) {
            modifyRewardPool(p, timespan);
        }
    }

    /**
     * @dev
     * Calculate total rewards of account
     * Sum of already distributed rewards and pending
     */
    function rewardsOf(address account) public view returns (uint256[] memory)
    {
        uint256[] memory rewards = new uint256[](rewardPools.length);

        // assign proper initial values
        for (uint256 poolIdx = 0; poolIdx < rewardPools.length; ++poolIdx) {
            rewards[poolIdx] = _distributedRewards[account][poolIdx] + _nonDistributedRewardOf(account, poolIdx);
        }

        return rewards;
    }

    function _rewardsPerTokenInc(uint256 poolIdx) internal view returns (uint256)
    {
        if (totalSupply() == 0) {
            return 0;
        }

        RewardPool storage rewardPool = rewardPools[poolIdx];

        uint64 calcEndTime = uint64(Math.min(block.timestamp, rewardPool.expiresAt));

        // check delta time since last distribution
        if (rewardPool.lastDistributionAt >= calcEndTime) {
            return 0;
        }

        uint256 partialDistribution = (calcEndTime - rewardPool.lastDistributionAt) * rewardPool.rewardRatio;

        // reduce partial distribution to unspend amount
        if (partialDistribution > rewardPool.unspentAmount) {
            // istanbul ignore next
            partialDistribution = rewardPool.unspentAmount;
        }

        return partialDistribution * 1e24 / totalSupply();
    }

    function _nonDistributedRewardOf(
        address account,
        uint256 poolIdx
    ) internal view returns (uint256)
    {
        RewardPool storage rewardPool = rewardPools[poolIdx];

        uint256 rewardsPerToken = rewardPool.rewardsPerTokenAcc - _rewardsPerTokenPaid[account][poolIdx] + _rewardsPerTokenInc(poolIdx);

        return rewardsPerToken * balanceOf(account) / 1e24;
    }

    /**
     * @dev
     * Stake modifier
     */
    modifier rewardingStakeModifier(uint256 amount)
    {
        _distributeRewards();
        _updateRewardPools();

        _;
    }

    /**
     * @dev
     * Withdrawal modifier
     */
    modifier rewardingWithdrawModifier()
    {
        _distributeRewards();
        _updateRewardPools();

        _;

        // claim rewards after rewards
        for (uint256 p = 0; p < rewardPools.length; ++p) {
            _claimRewards(p);
        }
    }

    /**
     * @dev
     * Distribute rewards to single user
     */
    function _distributeRewards() internal
    {
        for (uint256 poolIdx = 0; poolIdx < rewardPools.length; ++poolIdx) {
            RewardPool storage rewardPool = rewardPools[poolIdx];

            if (rewardPool.lastDistributionAt == 0) {
                // new reward pool - no distribution yet
                rewardPool.lastDistributionAt = uint64(block.timestamp);
                rewardPool.expiresAt = uint64(block.timestamp) + rewardPool.timespan;
                continue;
            }

            uint256 amount = _nonDistributedRewardOf(msg.sender, poolIdx);
            if (amount > 0) {
                _distributedRewards[msg.sender][poolIdx] += amount;
            }

            _rewardsPerTokenPaid[msg.sender][poolIdx] = rewardPool.rewardsPerTokenAcc + _rewardsPerTokenInc(poolIdx);
        }
    }

    /**
     * @dev
     * Update reward pools info (take snapshot)
     * Required when reward pools are changed, stake, withdraw
     */
    function _updateRewardPools() internal
    {
        for (uint256 poolIdx = 0; poolIdx < rewardPools.length; ++poolIdx) {
            RewardPool storage rewardPool = rewardPools[poolIdx];

            if (rewardPool.lastDistributionAt == 0) {
                // new reward pool - no distribution yet
                rewardPool.lastDistributionAt = uint64(block.timestamp);
                rewardPool.expiresAt = uint64(block.timestamp) + rewardPool.timespan;
                continue;
            }

            uint256 rewardsPerTokenInc = _rewardsPerTokenInc(poolIdx);

            rewardPool.rewardsPerTokenAcc += rewardsPerTokenInc;
            rewardPool.lastDistributionAt = uint64(block.timestamp);
            rewardPool.unspentAmount -= rewardsPerTokenInc * totalSupply() / 1e24;
        }
    }

    /**
     * @dev
     * Rewards claiming
     */
    function claimRewards(uint256 poolIdx) public
    {
        if (poolIdx > rewardPools.length) {
            revert InvalidPool();
        }

        _distributeRewards();
        _updateRewardPools();

        _claimRewards(poolIdx);
    }

    function claimAllRewards() public
    {
        _distributeRewards();
        _updateRewardPools();

        for (uint256 p = 0; p < rewardPools.length; ++p) {
            _claimRewards(p);
        }
    }

    function _claimRewards(uint256 poolIdx) internal
    {
        RewardPool storage rewardPool = rewardPools[poolIdx];
        uint256 amount = _distributedRewards[msg.sender][poolIdx];
        if (amount == 0) {
            return;
        }

        // send
        _distributedRewards[msg.sender][poolIdx] = 0;

        rewardPool.token.transfer(msg.sender, amount);

        emit RewardsClaimed(poolIdx, address(rewardPool.token), amount);
    }

}
