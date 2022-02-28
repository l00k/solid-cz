// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./NFToken/NFToken.sol";
import "./NFToken/Enumerable.sol";
import "./NFToken/Sale.sol";
import "./NFToken/Limited.sol";


contract SampleToken is
    NFToken,
    Enumerable,
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
        Enumerable()
        Limited(maxSupply_)
    {
    }


    function totalSupply() public virtual override(NFToken, Enumerable) view returns (uint256)
    {
        return Enumerable.totalSupply();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override(NFToken, Enumerable)
    {
        Enumerable._beforeTokenTransfer(from, to, tokenId);
    }

    function _mint(
        address to,
        Token calldata token
    ) internal override(NFToken, Limited) returns (uint256)
    {
        return Limited._mint(to, token);
    }

}
