// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./NFToken.sol";

abstract contract Limited is NFToken
{

    error MaxSupplyReached();

    uint256 public maxSupply;

    constructor(uint256 maxSupply_)
    {
        maxSupply = maxSupply_;
    }

    function _mint(
        address to,
        Token calldata token
    ) internal virtual override returns (uint256)
    {
        if (totalSupply() == maxSupply) {
            revert MaxSupplyReached();
        }

        return super._mint(to, token);
    }

}
