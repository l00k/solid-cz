// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {CoinBase} from "./CoinBase.sol";
import {Mintable} from "./Mintable.sol";
import {Lockable} from "./Lockable.sol";
import {CoinMarket} from "./CoinMarket.sol";


contract SampleCoin is
    CoinBase("SampleCoin", "$", 1000000, 3),
    Mintable,
    Lockable,
    CoinMarket(0.01 ether)
{

    function _transfer(address sender_, address recipient_, uint256 amount_) override(CoinBase, Lockable) internal
    {
        return Lockable._transfer(sender_, recipient_, amount_);
    }

}
