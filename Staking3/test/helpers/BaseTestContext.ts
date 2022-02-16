import { ExtERC20 } from '@/ExtERC20';
import { smock } from '@defi-wonderland/smock';
import { Block } from '@ethersproject/abstract-provider';
import { ContractReceipt } from '@ethersproject/contracts/src.ts/index';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, BigNumberish, ContractTransaction } from 'ethers';
import { ethers, network } from 'hardhat';
import { assertErrorMessage, compareBigNumbers, tokenFormat } from './utils';


export type ElementType<T extends ReadonlyArray<unknown>> = T extends ReadonlyArray<infer ElementType>
    ? ElementType
    : never;


export const AccountNames = [ 'alice', 'bob', 'carol', 'dave', 'eva' ];
export type AccountName = ElementType<typeof AccountNames>;

export type AccountMap<T> = {
    alice? : T,
    bob? : T,
    carol? : T,
    dave? : T,
    eva? : T,
};


export type AccountState = {
    balances : TokenMap<BigNumber>,
};


export type TokenMap<T> = {
    [name : string] : T,
};

export type TokenConfig = {
    name : string,
    symbol : string,
    initialSupply : BigNumber,
    decimals : number,
}

type ExecStruct = {
    tx : ContractTransaction,
    onSuccess? : (result : ContractReceipt) => any,
    onFailure? : (result : ContractReceipt) => any,
    onException? : (error : Error) => any,
};



export abstract class BaseTestContext
{
    
    protected tokenConfigs : TokenMap<TokenConfig> = {};
    
    public tokenContracts : TokenMap<ExtERC20>;
    
    public ownerAccount : SignerWithAddress;
    public accounts : AccountMap<SignerWithAddress> = {};
    
    public accountsState : AccountMap<AccountState> = {};
    
    
    public async initAccounts ()
    {
        const [ owner, alice, bob, carol, dave, eva ] = await ethers.getSigners();
        
        this.ownerAccount = owner;
        this.accounts = { alice, bob, carol, dave, eva };
        
        for (const name of AccountNames) {
            this.accountsState[name] = {
                balances: Object.fromEntries(
                    Object.keys(this.tokenConfigs).map(name => ([ name, BigNumber.from(0) ]))
                ),
            };
        }
    }
    
    public async verifyAccountsState(...accountNames: AccountName[])
    {
        for (const accountName of accountNames) {
            const account : SignerWithAddress = this.accounts[accountName];
            const accountState : AccountState = this.accountsState[accountName];

            for (const tokenName of Object.keys(this.tokenConfigs)) {
                const decimals = Math.round(this.tokenConfigs[tokenName].decimals / 2);
                const balance = await this.tokenContracts[tokenName].balanceOf(account.address);
                compareBigNumbers(
                    accountState.balances[tokenName],
                    balance,
                    decimals,
                    `${tokenName} balance of ${accountName}`
                );
            }
        }
    }
    
    public async executeInSingleBlock (
        callback : () => Promise<Promise<ContractTransaction>[]|void>,
        nextBlockDelay : number = 10
    ): Promise<ContractTransaction[]|void>
    {
        await network.provider.send('evm_setAutomine', [ false ]);
        
        const promises = await callback();
        await this.mineBlock(nextBlockDelay);
        
        await network.provider.send('evm_setAutomine', [ true ]);
        
        if (promises) {
            const txs = [];
            for (const promise of promises) {
                txs.push(await promise);
            }
            return txs;
        }
    }

    public async mineBlock (nextBlockDelay : number = 10) : Promise<Block>
    {
        const previousBlock = await ethers.provider.getBlock('latest');
        const nextTimestamp = previousBlock.timestamp + nextBlockDelay;
        
        await network.provider.send('evm_setNextBlockTimestamp', [ nextTimestamp ]);
        await network.provider.send('evm_mine');
        
        return ethers.provider.getBlock('latest');
    }
    
    
    protected async _deployContract (name : string, ...args : any[])
    {
        const [ owner ] = await ethers.getSigners();
        
        const contractFactory = await smock.mock(name, owner);
        const contract = <any>await contractFactory.deploy(...args);
        
        await contract.deployed();
        
        return contract;
    }
    
    protected async _createToken (
        name : string,
        initialTransfers : boolean = true
    ) : Promise<ExtERC20>
    {
        const tokenConfig = this.tokenConfigs[name];
        
        this.tokenContracts[name] = await this._deployContract(
            'ExtERC20',
            tokenConfig.name,
            tokenConfig.symbol,
            tokenConfig.initialSupply,
            tokenConfig.decimals
        );
        
        if (initialTransfers) {
            await this._initialTokenTransfers(
                name,
                tokenFormat(1e9, tokenConfig.decimals)
            );
        }
        
        return this.tokenContracts[name];
    }
    
    protected async _initialTokenTransfers (
        tokenName : string,
        amount : BigNumberish
    )
    {
        const contract = this.tokenContracts[tokenName];
        
        for (const [ accountName, account ] of Object.entries(this.accounts)) {
            const tx = await contract
                .connect(this.ownerAccount)
                .transfer(account.address, amount);
            await tx.wait();
            
            this.accountsState[accountName].balances[tokenName] = this.accountsState[accountName].balances[tokenName]
                .add(amount);
        }
    }
    
}
