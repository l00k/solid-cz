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
    ) public override returns (uint256)
    {
        uint256 swapAmount = _nextSwapAmount[tokenFrom][tokenTo];

        tokenFrom.transferFrom(msg.sender, address(this), amount);
        tokenTo.transfer(msg.sender, swapAmount);

        return swapAmount;
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
