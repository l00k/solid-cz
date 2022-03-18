// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


interface SwapProviderInterface
{

    function swap(
        IERC20 tokenFrom,
        IERC20 tokenTo,
        uint256 amount
    ) external returns (uint256);

}
