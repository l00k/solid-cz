// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Base.sol";


abstract contract Slashing is Base
{

    event RewardsSlashed(uint256 ratio);


    struct StakeRecord {
        uint64 time;
        uint256 amount;
    }


    uint64 public minimalStakeTime = 7 days;

    mapping(address => StakeRecord[]) public stakeRecords;






    /**
     * @dev
     * Modify minimal stake time
     */
    function changeMinimalStakeTime(uint64 minimalStakeTime_) public onlyOwner
    {
        minimalStakeTime = minimalStakeTime_;
    }


    /**
     * @dev
     * Stake modifier
     */
    modifier slashingStakeModifier(uint256 amount)
    {
        _;

        stakeRecords[msg.sender].push(StakeRecord(
            uint64(block.timestamp),
            amount
        ));
    }

    /**
     * @dev
     * Withdrawal modifier
     */
    modifier slashingWithdrawModifier()
    {
        _slashRewardsIfRequired();

        _;
    }

    /**
     * @dev
     * Slash rewards
     */
    function _slashRewardsIfRequired() internal
    {
        uint256 toSlash = 0;
        uint256 total = 0;

        StakeRecord[] storage records = stakeRecords[msg.sender];

        for (uint256 i = 0; i < records.length; ++i) {
            uint64 deltaTime = uint64(block.timestamp) - records[i].time;
            if (deltaTime < minimalStakeTime) {
                toSlash += deltaTime / minimalStakeTime * records[i].amount;
                total += records[i].amount;
            }
        }

        if (toSlash > 0) {
            uint256 ratio = toSlash / total * 1e18;

            // reduce distributed rewards
            // todo ld 2022-02-07 00:35:27

            revert RewardsSlashed(ratio);
        }
    }

}
