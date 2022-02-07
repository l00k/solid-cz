// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


contract Base is
    ERC20("4soft Defi Staking", "x4sDS"),
    Ownable
{

    error WrongAmount();
    error InsufficientAllowance(uint256 required, uint256 actual);

    event TokenStaked(uint256 amount);
    event TokenWithdrawn(uint256 amount);


    // Contract state
    ERC20 public stakeToken;


    constructor(address stakeToken_) {
        stakeToken = ERC20(stakeToken_);
    }


    /**
     * @dev
     * Stake given amount of token
     * Amount need to be approved before staking
     */
    function stake(uint256 amount) public virtual
    {
        if (amount == 0) {
            revert WrongAmount();
        }

        // check current allowance
        uint256 allowance = stakeToken.allowance(msg.sender, address(this));
        if (allowance < amount) {
            revert InsufficientAllowance(amount, allowance);
        }

        // mint share token
        _mint(msg.sender, amount);

        // transfer funds to contract
        stakeToken.transferFrom(msg.sender, address(this), amount);

        emit TokenStaked(amount);
    }


    /**
     * @dev
     * Withdrawals
     */
    function withdraw() public virtual
    {
        uint256 amount = balanceOf(msg.sender);
        if (amount == 0) {
            return;
        }

        // burn share token
        _burn(msg.sender, amount);

        // transfer funds to account
        stakeToken.transfer(msg.sender, amount);

        emit TokenWithdrawn(amount);
    }

}
