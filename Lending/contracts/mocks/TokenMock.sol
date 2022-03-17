// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";


contract TokenMock is
    IERC20Metadata,
    ERC20
{

    uint8 private _decimals;
    bool private _returnFalseOnTransfer;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply
    )
        ERC20(name_, symbol_)
    {
        _decimals = decimals_;
        _mint(msg.sender, initialSupply);
    }

    function decimals() public view override(IERC20Metadata, ERC20) returns (uint8)
    {
        return _decimals;
    }

    function setReturnFalseOnTransfer(
        bool returnFalseOnTransfer
    ) public
    {
        _returnFalseOnTransfer = returnFalseOnTransfer;
    }

    function transfer(
        address to,
        uint256 amount
    ) public virtual override(IERC20, ERC20) returns (bool)
    {
        if (_returnFalseOnTransfer) {
            return false;
        }

        return ERC20.transfer(to, amount);
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public virtual override(IERC20, ERC20) returns (bool)
    {
        if (_returnFalseOnTransfer) {
            return false;
        }

        return ERC20.transferFrom(from, to, amount);
    }

}
