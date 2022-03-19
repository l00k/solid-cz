// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../SwapProviderInterface.sol";


contract SwapProviderMock is
    SwapProviderInterface
{

    // from => to => amount
    mapping(IERC20 => mapping(IERC20 => uint256)) private _swapPrice;


    function swap(
        IERC20 tokenFrom,
        IERC20 tokenTo,
        uint256 amount
    ) public override returns (uint256)
    {
        uint256 swapPrice = _swapPrice[tokenFrom][tokenTo];
        uint256 swappedAmount = amount * swapPrice / 1e8;

        tokenFrom.transferFrom(msg.sender, address(this), amount);
        tokenTo.transfer(msg.sender, swappedAmount);

        return swappedAmount;
    }

    function setSwapPrice(
        IERC20 tokenFrom,
        IERC20 tokenTo,
        uint256 price
    ) public
    {
        _swapPrice[tokenFrom][tokenTo] = price;
    }

}
