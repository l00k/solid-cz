// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./Deposits.sol";


contract PlatformTresoury is
    Deposits
{

    event PlatformCommissionChanged(IERC20Metadata token, uint64 fraction);
    event TransferToTresoury(IERC20Metadata token, uint256 amount);
    event WithdrawnFromTresoury(IERC20Metadata token, address to, uint256 amount);

    error AmountExceedTresouryDeposit();


    // 8 digits precise
    mapping(IERC20Metadata => uint64) private _platformCommission;

    /**
     * @dev
     * Part of rewards which goes to platform
     * Precission: 8 digits
     */
    function getTokenPlatformCommission(IERC20Metadata token) public view onlySupportedAsset(token) returns (uint64)
    {
        return _platformCommission[token];
    }


    function setTokenPlatformCommission(
        IERC20Metadata token,
        uint64 platformCommission
    ) public
        onlySupportedAsset(token)
        onlyOwner
    {
        _platformCommission[token] = platformCommission;

        emit PlatformCommissionChanged(token, platformCommission);
    }


    function _depositIntoTresoury(
        IERC20Metadata token,
        uint256 amount
    ) internal
    {
        _increaseDepositShares(
            token,
            address(this),
            amount
        );
        _increaseTotalDeposit(
            token,
            amount
        );

        emit TransferToTresoury(token, amount);
    }

    /**
     * @dev
     * Distribute funds with commission applied
     */
    function _distributeFunds(
        IERC20Metadata token,
        uint256 amount
    ) internal
    {
        uint256 commissionAmount = amount * getTokenPlatformCommission(token) / 1e8;
        uint256 reducedAmount = amount - commissionAmount;

        // distrubute funds to users
        _increaseTotalDeposit(
            token,
            reducedAmount
        );

        _depositIntoTresoury(
            token,
            commissionAmount
        );
    }


    function withdrawFromPlatformTresoury(
        IERC20Metadata token,
        address target,
        uint256 amount
    ) public
        onlySupportedAsset(token)
        onlyOwner
    {
        _withdraw(
            token,
            address(this),
            target,
            amount
        );

        emit WithdrawnFromTresoury(token, target, amount);
    }

}
