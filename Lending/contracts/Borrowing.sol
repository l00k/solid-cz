// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./PlatformTresoury.sol";


contract Borrowing is
    PlatformTresoury
{

    error ZeroTokenPrice();
    error AmountExceedBorrowableLimit();

    event LoanOpened(address who, IERC20Metadata token, uint256 amount);
    event LoanPartiallyRepaid(address who, IERC20Metadata token, uint256 amount);
    event LoanFullyRepaid(address who, IERC20Metadata token);


    // token => uint256
    mapping(IERC20Metadata => uint256) private _totalDebit;

    // debit shares model
    mapping(IERC20Metadata => mapping(address => uint256)) private _accountDebitShares;
    mapping(IERC20Metadata => uint256) private _totalDebitShares;



    function getTotalTokenDebit(IERC20Metadata token) public view onlySupportedAsset(token) returns (uint256)
    {
        return _totalDebit[token];
    }

    function getAccountTokenDebit(
        IERC20Metadata token,
        address account
    ) public view virtual onlySupportedAsset(token) returns (uint256)
    {
        if (_totalDebitShares[token] == 0) {
            return 0;
        }

        return _accountDebitShares[token][account]
            * _totalDebit[token]
            / _totalDebitShares[token];
    }

    /**
     * @dev
     * Returns token debit in USD by account
     * Precision: 8 digits
     */
    function _getAccountTokenDebitEx(
        IERC20Metadata token,
        address account
    ) internal view returns (
        uint256 debit,
        uint256 debitValue,
        uint256 tokenPrice
    )
    {
        tokenPrice = getTokenPrice(token);

        debit = getAccountTokenDebit(token, account);
        if (debit == 0) {
            return (0, 0, tokenPrice);
        }

        uint8 tokenDecimals = token.decimals();

        // tokenDebitValue(8 digits precise) =
        //      debit (<tokenDecimals> digits precise)
        //      * price(8 digits precise)
        debitValue = debit
            * tokenPrice
            / (10 ** tokenDecimals);

        return (debit, debitValue, tokenPrice);
    }

    /**
     * @dev
     * Returns total amount of non utilised tokens which are available to borrow
     */
    function getTotalTokenBorrowable(
        IERC20Metadata token
    ) public view onlySupportedAsset(token) returns (uint256)
    {
        return getTotalTokenDeposit(token) - getTotalTokenDebit(token);
    }

    /**
     * @dev
     * Returns value borrowable by account depending on his current liquidity
     * It is limited to current global borrowable token amount (limited by borrowable fraction)
     */
    function getAccountTokenBorrowable(
        IERC20Metadata token,
        address account
    ) public view onlySupportedAsset(token) returns (uint256)
    {
        uint256 borrowableTotal = getTotalTokenBorrowable(token);
        if (borrowableTotal == 0) {
            return 0;
        }

        uint8 tokenDecimals = token.decimals();
        uint256 tokenPrice = getTokenPrice(token);

        int256 accountLiquidity = getAccountCollateralization(account);
        if (accountLiquidity <= 0) {
            return 0;
        }

        // borrowableAmount(<tokenDecimals> digits precise) =
        //      accountLiquidity(8 digits precise)
        //      / tokenPrice(8 digits precise)
        uint256 maxBorrowable = uint256(accountLiquidity) * (10 ** tokenDecimals)
            / tokenPrice;

        return maxBorrowable < borrowableTotal
            ? maxBorrowable
            : borrowableTotal;
    }

    /**
     * @dev
     * Returns total account debit in USD
     * Precision: 8 digits
     */
    function getAccountDebitValue(
        address account
    ) public view virtual returns (uint256)
    {
        uint256 totalDebit = 0;

        IERC20Metadata[] memory tokens = getSupportedTokens();

        for (uint i = 0; i<tokens.length; ++i) {
            IERC20Metadata token = tokens[i];
            totalDebit += _getAccountTokenDebitEx(token, account);
        }

        return totalDebit;
    }

    /**
     * @inheritdoc Deposits
     *
     * @dev
     * Collateralization should be reduced with borrowed assets value
     * It may return negative value if total debit is larger than account deposit liquditiy
     */
    function getAccountCollateralization(
        address account
    ) public view virtual override returns (int256)
    {
        return super.getAccountCollateralization(account)
            - int256(getAccountDebitValue(account))
            ;
    }

    /**
     * @dev
     * Amount of funds available to withdraw
     * Limited by current open loans by account
     */
    function getAccountTokenWithdrawable(
        IERC20Metadata token,
        address account
    ) public view virtual override
        onlySupportedAsset(token)
        returns (uint256)
    {
        uint256 baseWithdrawable = super.getAccountTokenWithdrawable(token, account);
        if (baseWithdrawable == 0) {
            return 0;
        }

        int256 liquidity = getAccountCollateralization(account);
        if (liquidity < 0) {
            return 0;
        }

        uint32 collateralFactor = getTokenCollateralFactor(token);

        if (collateralFactor > 0) {
            uint8 tokenDecimals = token.decimals();
            uint256 tokenPrice = getTokenPrice(token);

            // maxWithdrawable(<tokenDecimals> digits precise) =
            //      liquidity (8 digits precise)
            //      / collateralFactor(6 digits precise)
            //      / tokenPrice (8 digits precise)
            uint256 maxWithdrawable = uint256(liquidity) * (10 ** (tokenDecimals + 6))
                / collateralFactor
                / tokenPrice;

            // limit to deposit amount
            return maxWithdrawable < baseWithdrawable
                ? maxWithdrawable
                : baseWithdrawable;
        }
        else {
            // in case token asset is not collateral (factor = 0) entire deposit is withdrawable
            return baseWithdrawable;
        }
    }

    function _increaseTotalDebit(
        IERC20Metadata token,
        uint256 amount
    ) internal
    {
        _totalDebit[token] += amount;
    }

    function _decreaseTotalDebit(
        IERC20Metadata token,
        uint256 amount
    ) internal
    {
        _totalDebit[token] -= amount;
    }

    function _increaseDebitShares(
        IERC20Metadata token,
        address account,
        uint256 amount
    ) internal virtual
    {
        // sushibar shares
        uint256 share;

        if (_totalDebitShares[token] == 0 || _totalDebit[token] == 0) {
            share = amount;
        }
        else {
            share = amount * _totalDebitShares[token] / _totalDebit[token];
        }

        _accountDebitShares[token][account] += share;
        _totalDebitShares[token] += share;
    }

    function _decreaseDebitShares(
        IERC20Metadata token,
        address account,
        uint256 amount
    ) internal virtual
    {
        // sushibar shares
        uint256 share = _accountDebitShares[token][account] * amount / getAccountTokenDebit(token, account);

        _accountDebitShares[token][account] -= share;
        _totalDebitShares[token] -= share;
    }


    function borrow(
        IERC20Metadata token,
        uint256 amount
    ) public
        onlySupportedAsset(token)
    {
        uint256 borrowable = getAccountTokenBorrowable(
            token,
            msg.sender
        );
        if (amount > borrowable) {
            revert AmountExceedBorrowableLimit();
        }

        _beforeBorrow(token, amount);

        _increaseDebitShares(
            token,
            msg.sender,
            amount
        );
        _increaseTotalDebit(token, amount);

        bool result = token.transfer(msg.sender, amount);
        /* istanbul ignore if */
        if (!result) {
            revert CouldNotTransferFunds();
        }

        _afterBorrow(token, amount);

        emit LoanOpened(msg.sender, token, amount);
    }

    function _beforeBorrow(IERC20Metadata token, uint256 amount) internal virtual {}
    function _afterBorrow(IERC20Metadata token, uint256 amount) internal virtual {}


    /**
     * @dev
     * Internal repay method available for methods of payments non involving transfers
     */
    function _repay(
        IERC20Metadata token,
        address account,
        uint256 amount
    ) internal
    {
        _beforeRepay(token, amount);

        // reduce debit share
        _decreaseDebitShares(
            token,
            msg.sender,
            amount
        );
        _decreaseTotalDebit(token, amount);

        _afterRepay(token, amount);

        emit LoanPartiallyRepaid(account, token, amount);

        if (_accountDebitShares[token][account] == 0) {
            emit LoanFullyRepaid(account, token);
        }
    }

    function _beforeRepay(IERC20Metadata token, uint256 amount) internal virtual {}
    function _afterRepay(IERC20Metadata token, uint256 amount) internal virtual {}


    function repay(
        IERC20Metadata token,
        uint256 amount
    ) public
        onlySupportedAsset(token)
    {
        uint256 debit = getAccountTokenDebit(token, msg.sender);
        if (amount >= debit) {
            // reduce amount
            amount = debit;
        }
        if (debit == 0) {
            // no need for repayment
            return;
        }

        // check allowance
        uint256 allowed = token.allowance(msg.sender, address(this));
        if (amount > allowed) {
            revert InsufficientAllowance();
        }

        // try to transfer funds
        bool result = token.transferFrom(msg.sender, address(this), amount);
        /* istanbul ignore if */
        if (!result) {
            revert CouldNotTransferFunds();
        }

        _repay(
            token,
            msg.sender,
            amount
        );
    }

}
