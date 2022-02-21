// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./NftToken.sol";
import "./Sale.sol";


contract SampleToken is
    NftToken,
    Sale
{

    constructor (
        string memory name_,
        string memory symbol_,
        string memory baseURI_
    )
        NftToken(name_, symbol_, baseURI_)
    {
    }

}
