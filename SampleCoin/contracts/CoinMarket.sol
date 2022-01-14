// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {WrongAmount} from "./CoinBase.sol";
import {Mintable} from "./Mintable.sol";
import {Ownable} from "./Ownable.sol";


error NotAllowed();
error InvalidPrice(uint256 price);
error InvalidAmountSend(uint256 sent, uint256 required);


abstract contract CoinMarket is Ownable, Mintable
{

    event MarketPriceChanged(address by, uint256 price);
    event CoinsBought(address by, uint256 amount, uint256 price);

    address payable private _payoutTarget;
    uint256 private _price;


    constructor(uint256 initialPrice_)
    {
        _price = initialPrice_;
        _payoutTarget = payable(msg.sender);
        emit MarketPriceChanged(msg.sender, initialPrice_);
    }

    function payoutTarget() public view returns (address)
    {
        return _payoutTarget;
    }

    function price() public view returns (uint256)
    {
        return _price;
    }

    function changePayoutTarget(address target_) external ownerOnly
    {
        _payoutTarget = payable(target_);
    }

    function changePrice(uint256 price_) external ownerOnly
    {
        if (price_ == 0) {
            revert InvalidPrice(price_);
        }
        if (price_ == _price) {
            return;
        }

        _price = price_;
        emit MarketPriceChanged(msg.sender, price_);
    }

    function buy(uint256 amount_) external payable
    {
        if (amount_ == 0) {
            revert WrongAmount(amount_);
        }

        uint256 cost = amount_ * _price;
        if (msg.value != cost) {
            revert InvalidAmountSend(msg.value, cost);
        }

        _mint(address(this), msg.sender, amount_);
        _payoutTarget.transfer(cost);

        emit CoinsBought(msg.sender, amount_, _price);
    }

    receive() external payable {
        revert NotAllowed();
    }

}
