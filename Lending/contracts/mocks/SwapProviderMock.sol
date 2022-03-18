// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../SwapProviderInterface.sol";


contract SwapProviderMock is
    SwapProviderInterface
{

    // from => to => amount
    mapping(IERC20 => mapping(IERC20 => uint256)) private _nextSwapAmount;

    function swap(
        IERC20 tokenFrom,
        IERC20 tokenTo,
        uint256 amount
    ) public returns (uint256)
    {
        tokenFrom.transferFrom(msg.sender, address(this), amount);
        tokenTo.transfer(msg.sender, _nextSwapAmount);
        return _nextSwapAmount[tokenFrom][tokenTo];
    }

    function setNextStawpAmount(
        IERC20 tokenFrom,
        IERC20 tokenTo,
        uint256 amount
    ) public
    {
        _nextSwapAmount[tokenFrom][tokenTo] = amount;
    }

}
