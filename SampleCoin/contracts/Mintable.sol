// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {CoinBase, WrongAmount} from "./CoinBase.sol";
import {Ownable} from "./Ownable.sol";


abstract contract Mintable is CoinBase, Ownable
{

    event CoinsMinted(address by, address target, uint256 amount);
    event CoinsBurnt(address by, address target, uint256 amount);
    event TotalSupplyChanged(uint256 from, uint256 to);


    function _mint(address by_, address target_, uint256 amount_) internal
    {
        if (amount_ == 0) {
            revert WrongAmount(amount_);
        }

        uint256 oldTotalSupply = _totalSupply;

        _totalSupply += amount_;
        _balances[target_] += amount_;

        emit TotalSupplyChanged(oldTotalSupply, _totalSupply);
        emit CoinsMinted(by_, target_, amount_);
    }

    function mint(address target_, uint256 amount_) external ownerOnly
    {
        _mint(msg.sender, target_, amount_);
    }

    function burn(address target_, uint256 amount_) external ownerOnly
    {
        if (amount_ == 0) {
            revert WrongAmount(amount_);
        }

        if (amount_ > _balances[target_]) {
            // reduce to actual balance
            amount_ = _balances[target_];
        }

        uint256 oldTotalSupply = _totalSupply;

        _totalSupply -= amount_;
        _balances[target_] -= amount_;

        emit TotalSupplyChanged(oldTotalSupply, _totalSupply);
        emit CoinsBurnt(msg.sender, target_, amount_);
    }

}
