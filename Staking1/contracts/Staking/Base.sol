// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";


contract Base is
    ERC20("4soft Defi Staking", "x4sDS"),
    Ownable
{
    using EnumerableSet for EnumerableSet.AddressSet;


    error WrongAmount();
    error InsufficientBalance(uint256 required, uint256 actual);

    event TokenStaked(uint256 amount);
    event TokenWithdrawn(uint256 amount);


    // Contract state
    ERC20 internal _stakeToken;

    EnumerableSet.AddressSet internal _stakers;

    mapping(address => uint256) public stakerShare;
    uint256 public totalShares;


    constructor(address stakeToken_) {
        _stakeToken = ERC20(stakeToken_);
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
        uint256 allowance = _stakeToken.allowance(msg.sender, address(this));
        if (allowance < amount) {
            revert InsufficientBalance(amount, allowance);
        }

        // transfer funds to contract
        _stakeToken.transferFrom(msg.sender, address(this), amount);

        // mint share token
        _mint(msg.sender, amount);

        // update shares
        uint256 normalizedShare = _normalizeShare(amount, _stakeToken.decimals());
        stakerShare[msg.sender] += normalizedShare;
        totalShares += normalizedShare;

        _stakers.add(msg.sender);

        emit TokenStaked(amount);
    }


    /**
     * @dev
     * Shares normalization to same base using decimals
     */
    function _normalizeShare(uint256 amount, uint8 decimals) internal pure returns (uint256)
    {
        return amount * 1000000 / 10 ** decimals;
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

        // update shares
        uint256 normalizedShare = _normalizeShare(amount, _stakeToken.decimals());
        stakerShare[msg.sender] -= normalizedShare;
        totalShares -= normalizedShare;

        // transfer funds to account
        _stakeToken.transfer(msg.sender, amount);

        // in case sender shares are nulled no need to consider him in calculations
        _stakers.remove(msg.sender);

        emit TokenWithdrawn(amount);
    }

}
