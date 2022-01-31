import { Coin } from '@/Coin';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BaseContract, BigNumberish } from 'ethers';
import { ethers } from 'hardhat';
import { tokenFormat } from '../helpers/utils';
import { Factory } from './contracts';


export const Tokens = {
    staking: {
        name: '4soft Defi Training',
        symbol: 'DST',
        initialSupply: tokenFormat(1000000000),
        decimals: 18,
    },
    reward1: {
        name: '4soft Defi Reward 1',
        symbol: 'DR1',
        initialSupply: tokenFormat(1000000000),
        decimals: 18,
    },
    reward2: {
        name: '4soft Defi Reward 2',
        symbol: 'DR2',
        initialSupply: tokenFormat(1000000000),
        decimals: 18,
    },
    reward3: {
        name: '4soft Defi Reward 3',
        symbol: 'DR3',
        initialSupply: tokenFormat(1000000000, 8),
        decimals: 8,
    },
};

type TokenName = keyof typeof Tokens;


export async function initialErc20Transfers (contract : BaseContract, amount : BigNumberish)
{
    const accounts = await ethers.getSigners();
    const owner : SignerWithAddress = accounts.shift();
    
    for (const account of accounts) {
        const tx = await contract
            .connect(owner)
            .transfer(account.address, amount);
        await tx.wait();
    }
};

export async function createTokens (...names : TokenName[]) : Promise<Coin[]>
{
    const contracts : Coin[] = [];
    
    for (const name of names) {
        const contract = await Factory.Coin(
            Tokens[name].name,
            Tokens[name].symbol,
            Tokens[name].initialSupply,
            Tokens[name].decimals
        );
        
        await initialErc20Transfers(
            contract,
            tokenFormat(1000000, Tokens[name].decimals)
        );
        
        contracts.push(contract);
    }
    
    return contracts;
}
