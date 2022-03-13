// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./Assets.sol";


contract Deposits is
    Assets
{

    error InsufficientAllowance();
    error AmountExceedDeposit();
    error CouldNotTransferFunds();

    event CollateralFactorChanged(IERC20Metadata token, uint32 factor);
    event AssetDeposited(address who, IERC20Metadata token, uint256 amount);
    event AssetWithdrawn(address who, IERC20Metadata token, uint256 amount);


    // 1 = 0.0001%
    mapping(IERC20Metadata => uint32) private _tokenCollateralFactors;

    // token => deposits
    mapping(IERC20Metadata => uint256) private _totalDeposits;

    // account => token => deposit
    mapping(address => mapping(IERC20Metadata => uint256)) private _accountDeposit;


    function getTokenCollateralFactor(IERC20Metadata token) public view returns (uint32)
    {
        _verifyTokenSupported(token);
        return _tokenCollateralFactors[token];
    }

    function getAccountTokenDeposit(
        IERC20Metadata token,
        address account
    ) public view returns (uint256)
    {
        _verifyTokenSupported(token);
        return _accountDeposit[account][token];
    }

    function getTotalTokenDeposit(
        IERC20Metadata token
    ) public view returns (uint256)
    {
        _verifyTokenSupported(token);
        return _totalDeposits[token];
    }

    /**
     * @dev
     * Returns value of account asset (only single given token)
     * Precision: 8 digits
     */
    function _getAccountTokenDepositValue(
        IERC20Metadata token,
        address account
    ) internal view returns (uint256)
    {
        uint256 accountDeposit = getAccountTokenDeposit(token, account);
        if (accountDeposit == 0) {
            return 0;
        }

        uint8 tokenDecimals = token.decimals();
        uint256 price = getTokenPrice(token);

        // depositValue(8 digits precise) =
        //      accountDeposit(<tokenDecimals> digits precise)
        //      * price(8 digits precise)
        return accountDeposit * price
            / (10 ** tokenDecimals);
    }

    /**
     * @dev
     * Returns value of deposited assets
     * Precision: 8 digits
     */
    function getAccountDepositValue(
        address account
    ) public view returns (uint256)
    {
        uint256 value = 0;

        IERC20Metadata[] memory tokens = getSupportedTokens();

        for (uint256 tid = 0; tid < tokens.length; ++tid) {
            IERC20Metadata token = tokens[tid];
            value += _getAccountTokenDepositValue(token, account);
        }

        return value;
    }

    /**
     * @dev
     * Returns value of account assets considering collateral factor
     * Precision: 8 digits
     */
    function getAccountLiquidity(
        address account
    ) public view virtual returns (int256)
    {
        uint256 liquidity = 0;

        IERC20Metadata[] memory tokens = getSupportedTokens();

        for (uint256 tid = 0; tid < tokens.length; ++tid) {
            IERC20Metadata token = tokens[tid];

            uint32 collateralFactor = getTokenCollateralFactor(token);

            // liquidity(8 digits precise) =
            //      depositValue(8 digits precise)
            //      * collateralFactor(6 digits precise)
            liquidity += _getAccountTokenDepositValue(token, account) * collateralFactor
                / 1e6;
        }

        return int256(liquidity);
    }


    function setTokenCollateralFactor(
        IERC20Metadata token,
        uint32 collateralFactor
    ) public
        onlyOwner
    {
        _verifyTokenSupported(token);

        _tokenCollateralFactors[token] = collateralFactor;

        emit CollateralFactorChanged(token, collateralFactor);
    }

    function _increaseAccountDeposit(
        IERC20Metadata token,
        address account,
        uint256 amount
    ) internal
    {
        _totalDeposits[token] += amount;
        _accountDeposit[account][token] += amount;
    }

    function _decreaseAccountDeposit(
        IERC20Metadata token,
        address account,
        uint256 amount
    ) internal
    {
        _totalDeposits[token] -= amount;
        _accountDeposit[account][token] -= amount;
    }

    function deposit(
        IERC20Metadata token,
        uint256 amount
    ) public
    {
        _verifyTokenSupported(token);
        _verifyAssetActive(token);

        // check allowance
        uint256 allowed = token.allowance(msg.sender, address(this));
        if (amount > allowed) {
            revert InsufficientAllowance();
        }

        _beforeDeposit(token, amount);

        // transfer funds
        bool result = token.transferFrom(msg.sender, address(this), amount);
        /* istanbul ignore if */
        if (!result) {
            revert CouldNotTransferFunds();
        }

        _increaseAccountDeposit(
            token,
            msg.sender,
            amount
        );

        emit AssetDeposited(msg.sender, token, amount);

        _afterDeposit(token, amount);
    }

    function _beforeDeposit(
        IERC20Metadata token,
        uint256 amount
    ) internal virtual
    {
    }

    function _afterDeposit(
        IERC20Metadata token,
        uint256 amount
    ) internal virtual
    {
    }

    function withdraw(
        IERC20Metadata token,
        uint256 amount
    ) public
    {
        _verifyTokenSupported(token);

        // check deposit
        uint256 deposited = getAccountTokenDeposit(token, msg.sender);
        if (amount > deposited) {
            revert AmountExceedDeposit();
        }

        _beforeWithdraw(token, amount);

        _decreaseAccountDeposit(
            token,
            msg.sender,
            amount
        );

        // transfer funds
        bool result = token.transfer(msg.sender, amount);
        /* istanbul ignore if */
        if (!result) {
            revert CouldNotTransferFunds();
        }

        emit AssetWithdrawn(msg.sender, token, amount);

        _afterWithdraw(token, amount);
    }

    function _beforeWithdraw(
        IERC20Metadata token,
        uint256 amount
    ) internal virtual
    {
    }

    function _afterWithdraw(
        IERC20Metadata token,
        uint256 amount
    ) internal virtual
    {
    }


}
