// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./Assets.sol";


contract Deposits is
    Assets
{

    error InsufficientAllowance();
    error CouldNotTransferFunds();
    error AmountExceedWithdrawableLimit();
    error AmountExceedLiquidDeposit();

    event CollateralFactorChanged(IERC20Metadata token, uint32 factor);
    event AssetDeposited(address who, IERC20Metadata token, uint256 amount);
    event AssetWithdrawn(address who, IERC20Metadata token, uint256 amount);


    // 1 = 0.0001%
    mapping(IERC20Metadata => uint32) private _tokenCollateralFactors;

    // token => total deposits
    mapping(IERC20Metadata => uint256) private _totalDeposit;

    // deposit shares model
    mapping(IERC20Metadata => mapping(address => uint256)) private _accountDepositShares;
    mapping(IERC20Metadata => uint256) private _totalDepositShares;



    function getTokenCollateralFactor(IERC20Metadata token) public view onlySupportedAsset(token) returns (uint32)
    {
        return _tokenCollateralFactors[token];
    }


    function getAccountTokenDeposit(
        IERC20Metadata token,
        address account
    ) public view onlySupportedAsset(token) returns (uint256)
    {
        if (_totalDepositShares[token] == 0) {
            return 0;
        }

        return _totalDeposit[token]
            * _accountDepositShares[token][account]
            / _totalDepositShares[token];
    }

    function getTotalTokenDeposit(
        IERC20Metadata token
    ) public view onlySupportedAsset(token) returns (uint256)
    {
        return _totalDeposit[token];
    }

    /**
     * @dev
     * Returns amount of tokens available to transfer from contract
     */
    function getTokenLiquidAmount(
        IERC20Metadata token
    ) public view onlySupportedAsset(token) returns (uint256)
    {
        return token.balanceOf(address(this));
    }

    /**
     * @dev
     * Returns amount of funds available to withdraw
     */
    function getAccountTokenWithdrawable(
        IERC20Metadata token,
        address account
    ) public view virtual onlySupportedAsset(token) returns (uint256)
    {
        return getAccountTokenDeposit(token, account);
    }


    /**
     * @dev
     * Returns value of account asset (only single given token)
     * Precision: 8 digits
     */
    function _getAccountTokenDepositEx(
        IERC20Metadata token,
        address account
    ) internal view returns (
        uint256 deposit,
        uint256 depositValue,
        uint256 tokenPrice
    )
    {
        tokenPrice = getTokenPrice(token);

        deposit = getAccountTokenDeposit(token, account);
        if (deposit == 0) {
            return (0, 0, tokenPrice);
        }

        uint8 tokenDecimals = token.decimals();

        // depositValue(8 digits precise) =
        //      accountDeposit(<tokenDecimals> digits precise)
        //      * price(8 digits precise)
        depositValue = deposit
            * price
            / (10 ** tokenDecimals);

        return (deposit, depositValue, tokenPrice);
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
            (, uint256 tokenDepositValue) = _getAccountTokenDepositEx(tokens[tid], account);
            value += tokenDepositValue;
        }

        return value;
    }

    /**
     * @dev
     * Returns value of account assets considering collateral factor
     * Precision: 8 digits
     */
    function getAccountCollateralization(
        address account
    ) public view virtual returns (int256)
    {
        uint256 liquidity = 0;

        IERC20Metadata[] memory tokens = getSupportedTokens();

        for (uint256 tid = 0; tid < tokens.length; ++tid) {
            uint32 collateralFactor = getTokenCollateralFactor(tokens[tid]);
            (, uint256 tokenDepositValue) = _getAccountTokenDepositEx(tokens[tid], account);

            // liquidity(8 digits precise) =
            //      depositValue(8 digits precise)
            //      * collateralFactor(6 digits precise)
            liquidity += tokenDepositValue
                 * collateralFactor
                / 1e6;
        }

        return int256(liquidity);
    }


    function setTokenCollateralFactor(
        IERC20Metadata token,
        uint32 collateralFactor
    ) public
        onlySupportedAsset(token)
        onlyOwner
    {
        _tokenCollateralFactors[token] = collateralFactor;

        emit CollateralFactorChanged(token, collateralFactor);
    }


    function _increaseTotalDeposit(
        IERC20Metadata token,
        uint256 amount
    ) internal
    {
        _totalDeposit[token] += amount;
    }

    function _decreaseTotalDeposit(
        IERC20Metadata token,
        uint256 amount
    ) internal
    {
        _totalDeposit[token] -= amount;
    }

    function _increaseDepositShares(
        IERC20Metadata token,
        address account,
        uint256 amount
    ) internal virtual
    {
        // sushibar shares
        uint256 share;

        if (_totalDepositShares[token] == 0 || _totalDeposit[token] == 0) {
            share = amount;
        }
        else {
            share = amount * _totalDepositShares[token] / _totalDeposit[token];
        }

        _accountDepositShares[token][account] += share;
        _totalDepositShares[token] += share;
    }

    function _decreaseDepositShares(
        IERC20Metadata token,
        address account,
        uint256 amount
    ) internal virtual
    {
        // sushibar shares
        uint256 share = _accountDepositShares[token][account] * amount / getAccountTokenDeposit(token, account);

        _accountDepositShares[token][account] -= share;
        _totalDepositShares[token] -= share;
    }


    function deposit(
        IERC20Metadata token,
        uint256 amount
    ) public
        onlySupportedAsset(token)
    {
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

        _increaseDepositShares(
            token,
            msg.sender,
            amount
        );
        _increaseTotalDeposit(token, amount);

        emit AssetDeposited(msg.sender, token, amount);

        _afterDeposit(token, amount);
    }

    function _beforeDeposit(IERC20Metadata token, uint256 amount) internal virtual {}
    function _afterDeposit(IERC20Metadata token, uint256 amount) internal virtual {}


    function _withdraw(
        IERC20Metadata token,
        address fromAccount,
        address toAccount,
        uint256 amount
    ) internal
        onlySupportedAsset(token)
    {
        // verify withdrawable amount
        uint256 withdrawable = getAccountTokenWithdrawable(token, fromAccount);
        if (amount > withdrawable) {
            revert AmountExceedWithdrawableLimit();
        }

        // verify liquid amount
        uint256 liquidAmount = getTokenLiquidAmount(token);
        if (amount > liquidAmount) {
            revert AmountExceedLiquidDeposit();
        }

        _beforeWithdraw(token, fromAccount, toAccount, amount);

        _decreaseDepositShares(
            token,
            fromAccount,
            amount
        );
        _decreaseTotalDeposit(token, amount);

        // transfer funds
        bool result = token.transfer(toAccount, amount);
        /* istanbul ignore if */
        if (!result) {
            revert CouldNotTransferFunds();
        }

        emit AssetWithdrawn(fromAccount, token, amount);

        _afterWithdraw(token, fromAccount, toAccount, amount);
    }

    function withdraw(
        IERC20Metadata token,
        uint256 amount
    ) public
    {
        _withdraw(
            token,
            msg.sender,
            msg.sender,
            amount
        );
    }

    function _beforeWithdraw(IERC20Metadata token, address fromAccount, address toAccount, uint256 amount) internal virtual {}
    function _afterWithdraw(IERC20Metadata token, address fromAccount, address toAccount, uint256 amount) internal virtual {}


}
