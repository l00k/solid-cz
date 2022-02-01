// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Base.sol";


abstract contract StakeLimited is Base
{

    error TotalStakeExceedLimit(uint256 limit);
    error StakeBelowMinimal(uint256 min);
    error StakeAboveMaximal(uint256 max);

    event StakeLimitsChanged(uint256 totalStakeLimit, uint256 minStakePerAccount, uint256 maxStakePerAccount);
    event EarlyWithdrawalParamsChanged(uint256 minStakeTime, uint32 earlyWithdrawalSlashRatePermill);



    uint256 public totalStakeLimit = 0;
    uint256 public minStakePerAccount = 0;
    uint256 public maxStakePerAccount = 0;

    uint256 public minStakeTime = 0;
    uint32 public earlyWithdrawalSlashRatePermill = 0;


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
     * Change early withdrawal params
     */
    function changeEarlyWithdrawalParams(
        uint256 minStakeTime_,
        uint32 earlyWithdrawalSlashRatePermill_
    ) public onlyOwner
    {
        minStakeTime = minStakeTime_;
        earlyWithdrawalSlashRatePermill = earlyWithdrawalSlashRatePermill_;

        emit EarlyWithdrawalParamsChanged(minStakeTime, earlyWithdrawalSlashRatePermill);
    }

    /**
     * @dev
     * Amount need to be approved before staking
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
