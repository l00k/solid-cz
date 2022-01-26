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

    event RewardPoolCreated(address rewardToken, uint256 amount, uint64 timespan);
    event TokenStaked(uint256 amount);


    struct RewardPool {
        IERC20 token;
        uint256 pool;
        uint256 rewardPerSecond;
        uint64 lastDistribution;
        uint64 endTime;
    }

    struct Stake {
        uint256 amount;
        uint64 stakedAt;
    }

    struct Reward {
        address token;
        uint256 balance;
    }

    IERC20 private _stakeToken;
    EnumerableSet.AddressSet private _stakers;

    RewardPool[] private _rewardPools;

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

        // maybe it is good idea to deploy token storage contract and transfer funds there?
        // in order to separate rewards pool from contract balance

        // calculate reward per second
        uint256 rewardPerSecond = amount / timespan;

        // create new pool
        _rewardPools.push(RewardPool(
            token,
            amount,
            rewardPerSecond,
            0,
            uint64(block.timestamp + timespan)
        ));

        emit RewardPoolCreated(address(token), amount, timespan);
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

        // add new staker to list
        _stakers.add(msg.sender);

        emit TokenStaked(amount);
    }

    /**
     * @dev
     * Calculate sum of all distributed rewards
     */
    function distributedRewards() public view returns (Reward[] memory)
    {
        Reward[] memory rewards = new Reward[](_rewardPools.length);

        // assign proper initial values
        for (uint32 p = 0; p < _rewardPools.length; ++p) {
            rewards[p] = Reward(
                address(_rewardPools[p].token),
                0
            );
        }

        for (uint32 p = 0; p < _rewardPools.length; ++p) {
            for (uint256 s = 0; s < _stakers.length(); ++s) {
                rewards[p].balance += _distributedRewards[_stakers.at(s)][p];
            }
        }

        return rewards;
    }

    /**
     * @dev
     * Multply amount using account share
     */
    function _accountShareMultiply(address account, uint256 amount) internal view returns (uint256)
    {
        if (totalSupply() == 0) {
            return 0;
        }

        uint256 totalRewards = 0;

        uint256 accountRewards = 0;
        for (uint32 p = 0; p < _rewardPools.length; ++p) {
            accountRewards += _distributedRewards[account][p];

            for (uint256 s = 0; s < _stakers.length(); ++s) {
                totalRewards += _distributedRewards[_stakers.at(s)][p];
            }
        }

        return amount * (balanceOf(account) + accountRewards) / (totalSupply() + totalRewards);
    }

    /**
     * @dev
     * Calculate total rewards of account
     * Sum of already distributed rewards and pending
     */
    function rewardsOf(address account) public view returns (Reward[] memory)
    {
        Reward[] memory rewards = new Reward[](_rewardPools.length);

        // assign proper initial values
        for (uint32 p = 0; p < _rewardPools.length; ++p) {
            rewards[p] = Reward(
                address(_rewardPools[p].token),
                0
            );
        }

        // calculate rewards before giving away
        for (uint32 p = 0; p < _rewardPools.length; ++p) {
            rewards[p].balance += _distributedRewards[account][p];

            uint64 calcEndTime = uint64(Math.min(block.timestamp, _rewardPools[p].endTime));
            uint64 deltaTime = calcEndTime - _rewardPools[p].lastDistribution;

            if (deltaTime > 0) {
                uint256 partialDistribution = deltaTime * _rewardPools[p].rewardPerSecond;

                // reduce partial distribution to pool limit
                if (partialDistribution > _rewardPools[p].pool) {
                    partialDistribution = _rewardPools[p].pool;
                }

                rewards[p].balance += _accountShareMultiply(account, partialDistribution);
            }
        }

        return rewards;
    }

    /**
     * @dev
     * Distribute rewards using current context values
     * especially share, blockPerSecond
     */
    function _distributeRewards() internal
    {
        for (uint32 p = 0; p < _rewardPools.length; ++p) {
            uint64 calcEndTime = uint64(Math.min(block.timestamp, _rewardPools[p].endTime));
            uint64 deltaTime = calcEndTime - _rewardPools[p].lastDistribution;

            if (deltaTime > 0) {
                uint256 partialDistribution = deltaTime * _rewardPools[p].rewardPerSecond;

                // reduce partial distribution to pool limit
                if (partialDistribution > _rewardPools[p].pool) {
                    partialDistribution = _rewardPools[p].pool;
                }

                for (uint s = 0; s < _stakers.length(); ++s) {
                    // calculate distribution using inversed share factor
                    uint256 amount = _accountShareMultiply(_stakers.at(s), partialDistribution);

                    _distributedRewards[_stakers.at(s)][p] += amount;
                    _rewardPools[p].pool -= amount;
                }
            }

            _rewardPools[p].lastDistribution = uint64(block.timestamp);
        }
    }

}
