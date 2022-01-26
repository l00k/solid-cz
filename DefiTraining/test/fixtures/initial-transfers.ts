import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BaseContract, BigNumberish } from 'ethers';
import { ethers } from 'hardhat';


export async function initialErc20Transfers (contract : BaseContract, amount : BigNumberish)
{
    const accounts = await ethers.getSigners();
    const owner : SignerWithAddress = accounts.shift();
    
    for (const account of accounts) {
        const tx = await contract
            .connect(owner)
            .transfer(account.address, amount);
        const result = await tx.wait();
    }
};
