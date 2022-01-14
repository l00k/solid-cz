// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {CoinBase} from "./CoinBase.sol";
import {Ownable} from "./Ownable.sol";


error AllAccountsLocked();
error AccountLocked();


abstract contract Lockable is CoinBase, Ownable
{

    event GlobalLockChanged(address by, bool lock);
    event AccountLockChanged(address by, address target, bool lock);

    bool private _globalLock = false;
    mapping(address => bool) private _lockedAddress;


    modifier nonLockedOnly(address target_)
    {
        if (_globalLock) {
            revert AllAccountsLocked();
        }
        if (_lockedAddress[target_]) {
            revert AccountLocked();
        }
        _;
    }

    function isLocked(address target_) public view returns (bool)
    {
        return _globalLock || _lockedAddress[target_];
    }

    function modifiyGlobalLock(bool lock_) external ownerOnly
    {
        if (_globalLock == lock_) {
            return;
        }

        _globalLock = lock_;
        emit GlobalLockChanged(msg.sender, lock_);
    }

    function modifiyAccountLock(address target_, bool lock_) external ownerOnly
    {
        if (_lockedAddress[target_] == lock_) {
            return;
        }

        _lockedAddress[target_] = lock_;
        emit AccountLockChanged(msg.sender, target_, lock_);
    }


    function _transfer(address sender_, address recipient_, uint256 amount_) virtual override internal
        nonLockedOnly(sender_)
    {
        return CoinBase._transfer(sender_, recipient_, amount_);
    }

}
