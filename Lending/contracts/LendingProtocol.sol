// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Interest.sol";


contract LendingProtocol is
    Interest
{

    /**
     * @dev
     * todo This is test only method. Should be removed before moving to production
     */
    function __test__burnBalance(
        IERC20Metadata token,
        uint256 amount
    ) public
    {
        token.transfer(address(0xdead), amount);
    }

    /**
     * @dev
     * todo This is test only method. Should be removed before moving to production
     */
    function __test__distributeFunds(
        IERC20Metadata token,
        uint256 amount
    ) public
    {
        _distributeFunds(
            token,
            amount
        );
    }

}
