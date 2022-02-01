// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Base.sol";


abstract contract Rewarding is Base
{
    using EnumerableSet for EnumerableSet.AddressSet;


    error WrongTimespan();
    error InvalidPool();

    event RewardPoolCreated(uint256 poolIdx, address rewardToken, uint256 amount, uint64 timespan);
    event RewardPoolModified(uint256 poolIdx, uint256 amount, uint64 timespan);

    event RewardsClaimed(uint256 poolIdx, address rewardToken, uint256 amount);


    struct RewardPool {
        ERC20 token;
        uint256 unspentAmount;
        uint256 rewardPerSecond;
        uint64 timespan;
        uint64 lastDistributionAt;
        uint64 expiresAt;
    }

    struct Reward {
        address token;
        uint256 balance;
    }


    RewardPool[] public rewardPools;

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
            revert InsufficientBalance(amount, allowance);
        }

        // transfer funds
        token.transferFrom(msg.sender, address(this), amount);

        // calculate reward per second
        uint256 rewardPerSecond = amount / timespan;

        // create new pool
        rewardPools.push(RewardPool(
            token,
            amount,
            rewardPerSecond,
            timespan,
            totalShares > 0 ? uint64(block.timestamp) : 0,
            totalShares > 0 ? uint64(block.timestamp) + timespan : 0
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

        // distribute rewards (no need for shares update)
        _distributeRewards(poolIdx);

        // recalculate reward per second
        rewardPool.timespan = timespan;
        rewardPool.rewardPerSecond = rewardPool.unspentAmount / timespan;
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
    function rewardsOf(address account) public view returns (Reward[] memory)
    {
        Reward[] memory rewards = new Reward[](rewardPools.length);

        // assign proper initial values
        for (uint256 p = 0; p < rewardPools.length; ++p) {
            rewards[p] = Reward(
                address(rewardPools[p].token),
                _distributedRewards[account][p] + _nonDistributedRewardOf(account, rewardPools[p])
            );
        }

        return rewards;
    }

    function _nonDistributedRewardOf(
        address account,
        RewardPool storage rewardPool
    ) internal view returns (uint256)
    {
        if (totalShares == 0) {
            return 0;
        }

        uint64 calcEndTime = uint64(Math.min(block.timestamp, rewardPool.expiresAt));

        // time from last distribution (if any) to end time
        if (rewardPool.lastDistributionAt >= calcEndTime) {
            return 0;
        }

        uint256 partialDistribution = (calcEndTime - rewardPool.lastDistributionAt)
            * rewardPool.rewardPerSecond;

        // reduce partial distribution to unspend amount
        if (partialDistribution > rewardPool.unspentAmount) {
            // istanbul ignore next
            partialDistribution = rewardPool.unspentAmount;
        }

        return partialDistribution * stakerShare[account] / totalShares;
    }

    /**
     * @dev
     * It is required to distribute rewards before executing stake
     */
    modifier rewardingStakeModifier(uint256 amount)
    {
        _distributeRewardsAndUpdateShares();
        _;
    }

    /**
     * @dev
     * It is required to distribute rewards before executing stake
     */
    modifier rewardingWithdrawModifier()
    {
        _distributeRewardsAndUpdateShares();

        _;

        // claim rewards after rewards
        for (uint256 p = 0; p < rewardPools.length; ++p) {
            _claimRewards(p);
        }
    }

    /**
     * @dev
     * Distribute rewards and update shares
     * Required when reward pools are changed, stake, withdraw
     */
    function _distributeRewardsAndUpdateShares() internal
    {
        // it is required to create temporary shares change array
        // shares has to be updated after rewards distribution (not in the same time)
        uint256[] memory sharesChange = new uint256[](_stakers.length());

        for (uint256 p = 0; p < rewardPools.length; ++p) {
            RewardPool storage rewardPool = rewardPools[p];

            // new reward pool - no distribution yet
            if (rewardPool.lastDistributionAt == 0) {
                rewardPool.lastDistributionAt = uint64(block.timestamp);
                rewardPool.expiresAt = uint64(block.timestamp) + rewardPool.timespan;
                continue;
            }

            uint8 decimals = rewardPool.token.decimals();

            uint64 deltaTime = uint64(block.timestamp) - rewardPool.lastDistributionAt;
            if (deltaTime == 0) {
                // already distributed
                continue;
            }

            for (uint s = 0; s < _stakers.length(); ++s) {
                uint256 amount = _nonDistributedRewardOf(_stakers.at(s), rewardPool);
                if (amount > 0) {
                    // distribute rewards
                    _distributedRewards[_stakers.at(s)][p] += amount;

                    // reduce reward pool unspend amount
                    rewardPool.unspentAmount -= amount;

                    // save shares change in temporary table
                    sharesChange[s] += _normalizeShare(amount, decimals);
                }
            }

            rewardPool.lastDistributionAt = uint64(block.timestamp);
        }

        // update shares
        for (uint32 s = 0; s < _stakers.length(); ++s) {
            uint256 normalizedShare = sharesChange[s];
            if (normalizedShare > 0) {
                totalShares += normalizedShare;
                stakerShare[_stakers.at(s)] += normalizedShare;
            }
        }
    }

    /**
     * @dev
     * Distribute rewards in single pool
     */
    function _distributeRewards(uint256 poolIdx) internal
    {
        RewardPool storage rewardPool = rewardPools[poolIdx];

        // new reward pool - no distribution yet
        if (rewardPool.lastDistributionAt == 0) {
            rewardPool.lastDistributionAt = uint64(block.timestamp);
            rewardPool.expiresAt = uint64(block.timestamp) + rewardPool.timespan;
            return;
        }

        uint64 deltaTime = uint64(block.timestamp) - rewardPool.lastDistributionAt;
        if (deltaTime == 0) {
            // already distributed
            return;
        }

        for (uint s = 0; s < _stakers.length(); ++s) {
            uint256 amount = _nonDistributedRewardOf(_stakers.at(s), rewardPool);
            if (amount > 0) {
                // distribute rewards
                _distributedRewards[_stakers.at(s)][poolIdx] += amount;

                // reduce reward pool unspend amount
                rewardPool.unspentAmount -= amount;
            }
        }

        rewardPool.lastDistributionAt = uint64(block.timestamp);
    }

    /**
     * @dev
     * Rewards claiming
     */
    function _claimRewards(uint256 poolIdx) internal
    {
        RewardPool storage rewardPool = rewardPools[poolIdx];
        uint256 amount = _distributedRewards[msg.sender][poolIdx];
        if (amount == 0) {
            return;
        }

        // adjust share
        uint256 normalizedShare = _normalizeShare(amount, rewardPool.token.decimals());
        stakerShare[msg.sender] -= normalizedShare;
        totalShares -= normalizedShare;

        // send
        _distributedRewards[msg.sender][poolIdx] = 0;

        rewardPool.token.transfer(msg.sender, amount);

        emit RewardsClaimed(poolIdx, address(rewardPool.token), amount);
    }

    function claimRewards(uint256 poolIdx) public
    {
        if (poolIdx > rewardPools.length) {
            revert InvalidPool();
        }

        _distributeRewardsAndUpdateShares();
        _claimRewards(poolIdx);
    }

    function claimAllRewards() public
    {
        _distributeRewardsAndUpdateShares();

        for (uint256 p = 0; p < rewardPools.length; ++p) {
            _claimRewards(p);
        }
    }

}
