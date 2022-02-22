// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./NFToken/NFToken.sol";
import "./NFToken/Sale.sol";
import "./NFToken/Limited.sol";


contract SampleToken is
    NFToken,
    Limited,
    Sale
{

    constructor (
        string memory name_,
        string memory symbol_,
        string memory baseURI_,
        uint256 maxSupply_
    )
        NFToken(name_, symbol_, baseURI_)
        Limited(maxSupply_)
    {
    }


    function _mint(
        address to,
        Token calldata token
    ) internal override(NFToken, Limited) returns (uint256)
    {
        return Limited._mint(to, token);
    }

    function _burn(uint256 tokenId) internal override(NFToken, Limited)
    {
        Limited._burn(tokenId);
    }

}
