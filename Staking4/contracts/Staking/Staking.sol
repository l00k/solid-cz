// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Base.sol";
import "./RewardingWithSlash.sol";
import "./StakeLimited.sol";

contract Staking is
    Base,
    RewardingWithSlash,
    StakeLimited
{

    constructor(address stakeToken_)
        Base(stakeToken_)
    {
    }

    function stake(uint256 amount) public virtual override
        limitedStakeModifier(amount)
        rewardingStakeModifier(amount)
        slashingStakeModifier(amount)
    {
        Base.stake(amount);
    }

    function withdraw() public virtual override
        rewardingWithdrawModifier()
        slashingWithdrawModifier()
    {
        Base.withdraw();
    }

}
