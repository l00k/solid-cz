// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Base.sol";


abstract contract StakeLimited is Base
{

    error TotalStakeExceedLimit(uint256 limit);
    error StakeBelowMinimal(uint256 min);
    error StakeAboveMaximal(uint256 max);

    event StakeLimitsChanged(uint256 totalStakeLimit, uint256 minStakePerAccount, uint256 maxStakePerAccount);


    uint256 public totalStakeLimit = 0;
    uint256 public minStakePerAccount = 0;
    uint256 public maxStakePerAccount = 0;


    /**
     * @dev
     * Change stake limits
     */
    function changeStakeLimits(
        uint256 totalStakeLimit_,
        uint256 minStakePerAccount_,
        uint256 maxStakePerAccount_
    ) public onlyOwner
    {
        totalStakeLimit = totalStakeLimit_;
        minStakePerAccount = minStakePerAccount_;
        maxStakePerAccount = maxStakePerAccount_;

        emit StakeLimitsChanged(totalStakeLimit, minStakePerAccount, maxStakePerAccount);
    }

    /**
     * @dev
     * Stake modifier
     */
    modifier limitedStakeModifier(uint256 amount)
    {
        uint256 targetTotalStake = totalSupply() + amount;
        if (totalStakeLimit != 0 && targetTotalStake > totalStakeLimit) {
            revert TotalStakeExceedLimit(totalStakeLimit);
        }

        uint256 targetBalance = balanceOf(msg.sender) + amount;
        if (minStakePerAccount != 0 && targetBalance < minStakePerAccount) {
            revert StakeBelowMinimal(minStakePerAccount);
        }
        if (maxStakePerAccount != 0 && targetBalance > maxStakePerAccount) {
            revert StakeAboveMaximal(maxStakePerAccount);
        }

        _;
    }

}
