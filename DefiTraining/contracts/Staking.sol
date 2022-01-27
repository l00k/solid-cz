// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";


contract Staking is
    ERC20("4soft Defi Staking", "x4sDS"),
    Ownable
{

    using EnumerableSet for EnumerableSet.AddressSet;


    error WrongAmount();
    error WrongTimespan();
    error InsufficientBalance(uint256 required, uint256 balance);

    event RewardPoolCreated(uint256 index, address rewardToken, uint256 amount, uint64 timespan);
    event TokenStaked(uint256 amount);


    struct RewardPool {
        IERC20 token;
        uint256 unspentAmount;
        uint256 rewardPerSecond;
        uint64 lastDistribution;
        uint64 expiration;
    }

    struct Stake {
        uint256 amount;
        uint64 stakedAt;
    }

    struct Reward {
        address token;
        uint256 balance;
    }


    // Contract state

    IERC20 private _stakeToken;

    EnumerableSet.AddressSet private _stakers;

    mapping(address => uint256) private _stakerShare;
    uint256 private _totalShares;

    RewardPool[] public rewardPools;

    mapping(address => mapping(uint32 => uint256)) private _distributedRewards;



    constructor(address stakeToken) {
        _stakeToken = IERC20(stakeToken);
    }

    /**
     * @dev
     * Owner endpoint for creating new reward pools
     */
    function createRewardsPool(
        address rewardToken,
        uint256 amount,
        uint64 timespan
    ) external onlyOwner
    {
        if (amount == 0) {
            revert WrongAmount();
        }
        if (timespan == 0) {
            revert WrongTimespan();
        }

        IERC20 token = IERC20(rewardToken);

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
            uint64(block.timestamp),
            uint64(block.timestamp + timespan)
        ));

        emit RewardPoolCreated(rewardPools.length - 1, address(token), amount, timespan);
    }

    /**
     * @dev
     * Stake given amount of token
     * Amount need to be approved before staking
     */
    function stake(uint256 amount) external
    {
        if (amount == 0) {
            revert WrongAmount();
        }

        _distributeRewards();

        // check current allowance
        uint256 allowance = _stakeToken.allowance(msg.sender, address(this));
        if (allowance < amount) {
            revert InsufficientBalance(amount, allowance);
        }

        // transfer funds to contract
        _stakeToken.transferFrom(msg.sender, address(this), amount);

        // mint share token
        _mint(msg.sender, amount);

        // update shares
        _stakerShare[msg.sender] += amount;
        _totalShares += amount;

        _stakers.add(msg.sender);

        emit TokenStaked(amount);
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
        for (uint32 p = 0; p < rewardPools.length; ++p) {
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
        uint64 calcEndTime = uint64(Math.min(block.timestamp, rewardPool.expiration));

        // time from last distribution (if any) to end time
        uint64 deltaTime = calcEndTime - rewardPool.lastDistribution;
        if (deltaTime == 0) {
            return 0;
        }

        uint256 partialDistribution = deltaTime * rewardPool.rewardPerSecond;

        // reduce partial distribution to unspend amount
        if (partialDistribution > rewardPool.unspentAmount) {
            partialDistribution = rewardPool.unspentAmount;
        }

        return _accountShareMultiply(account, partialDistribution);
    }

    /**
     * @dev
     * Multply amount using account share
     */
    function _accountShareMultiply(address account, uint256 amount) internal view returns (uint256)
    {
        if (_totalShares == 0) {
            return 0;
        }

        return amount * _stakerShare[account] / _totalShares;
    }

    /**
     * @dev
     * Distribute rewards using current context values
     * Required when reward pools are changed, stake, withdraw
     */
    function _distributeRewards() internal
    {
        for (uint32 p = 0; p < rewardPools.length; ++p) {
            uint64 deltaTime = uint64(block.timestamp) - rewardPools[p].lastDistribution;
            if (deltaTime == 0) {
                // already distributed
                continue;
            }

            for (uint s = 0; s < _stakers.length(); ++s) {
                uint256 amount = _nonDistributedRewardOf(_stakers.at(s), rewardPools[p]);

                // distribute rewards
                _distributedRewards[_stakers.at(s)][p] += amount;

                // adjust share
                _stakerShare[_stakers.at(s)] += amount;
                _totalShares += amount;

                // reduce reward pool unspend amount
                rewardPools[p].unspentAmount -= amount;
            }

            rewardPools[p].lastDistribution = uint64(block.timestamp);
        }
    }

}
