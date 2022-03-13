import { TypedEvent } from '@/common';
import { IERC20 } from '@/IERC20';
import { smock } from '@defi-wonderland/smock';
import { Block } from '@ethersproject/abstract-provider';
import { ContractReceipt } from '@ethersproject/contracts/src.ts/index';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai, { expect } from 'chai';
import { solidity } from 'ethereum-waffle';
import { BigNumber, Contract, ContractTransaction, Event } from 'ethers';
import { ethers, network } from 'hardhat';
import _ from 'lodash';

chai.use(solidity);
chai.use(smock.matchers);


export function findEvent<T extends Event> (result : ContractReceipt, eventName : string, offset : number = 0) : T
{
    if (!result.events?.length) {
        expect.fail(`Event ${eventName} not found`);
    }
    
    const events = result.events.filter(e => e.event == eventName);
    if (events.length - 1 < offset) {
        expect.fail(`Event ${eventName}#${offset} not found`);
    }
    
    return <any>events[offset];
}


export function assertEvent<T extends TypedEvent> (
    result : ContractReceipt,
    eventName : string,
    eventArgs : Partial<T['args']>,
    offset : number = 0
)
{
    const event = findEvent(result, eventName, offset);
    
    for (const [ property, value ] of Object.entries(eventArgs)) {
        expect(event.args[property]).to.be.equal(value);
    }
}


type AccountCallback = (account : SignerWithAddress) => Promise<ContractTransaction>;

export async function assertIsAvailableOnlyForOwner (
    callback : AccountCallback,
    ownerOverride? : SignerWithAddress,
    errorMessage : string = 'Ownable: caller is not the owner'
)
{
    const allAccounts = await ethers.getSigners();
    let owner = allAccounts[0];
    
    if (ownerOverride) {
        owner = ownerOverride;
    }
    
    const nonOwnerAccounts = allAccounts
        .filter(account => account.address != owner.address)
        .slice(0, 2);
    
    for (const account of nonOwnerAccounts) {
        const nonOwnerTx = callback(account);
        await expect(nonOwnerTx).to.be.revertedWith(errorMessage);
    }
    
    const ownerTx = await callback(owner);
    const result = await ownerTx.wait();
    expect(result.status).to.be.equal(1);
}


export async function mineBlock (delay : number = 10) : Promise<Block>
{
    const previousBlock = await ethers.provider.getBlock('latest');
    const nextTimestamp = previousBlock.timestamp + delay;
    await network.provider.send('evm_setNextBlockTimestamp', [ nextTimestamp ]);
    await network.provider.send('evm_mine');
    return ethers.provider.getBlock('latest');
}


export async function txExec (txPromise : Promise<ContractTransaction>) : Promise<[ ContractTransaction, ContractReceipt ]>
{
    const tx = await txPromise;
    const result = await tx.wait();
    
    expect(result.status).to.be.equal(1);
    
    return [ tx, result ];
}


export async function executeInSingleBlock (
    callback : () => Promise<Promise<ContractTransaction>[] | void>,
    nextBlockDelay : number = 10
) : Promise<ContractTransaction[]>
{
    await network.provider.send('evm_setAutomine', [ false ]);
    
    const promises = await callback();
    await mineBlock(nextBlockDelay);
    
    await network.provider.send('evm_setAutomine', [ true ]);
    
    const txs = [];
    
    if (promises) {
        for (const promise of promises) {
            txs.push(await promise);
        }
    }
    
    return txs;
}

type TxCheckCallback = (tx : ContractTransaction, reciept : ContractReceipt) => void;

export async function waitForTxs (txs : ContractTransaction[], checkCallback? : TxCheckCallback) : Promise<ContractReceipt[]>
{
    const results = [];
    
    for (const tx of txs) {
        const result = await tx.wait();
        expect(result.status).to.be.equal(1);
        
        if (checkCallback) {
            checkCallback(tx, result);
        }
        
        results.push(result);
    }
    
    return results;
}


export async function deployContract<T extends Contract> (name : string, ...args : any[]) : Promise<T>
{
    const [ owner ] = await ethers.getSigners();
    
    const contractFactory = await smock.mock(name, owner);
    const contract = <any>await contractFactory.deploy(...args);
    
    await contract.deployed();
    
    return contract;
}


export async function createTokenMock (
    name : string,
    symbol : string,
    decimals : number = 18,
    initialSupply : BigNumber = null,
    initialTransfers : boolean = true
) : Promise<IERC20>
{
    if (!initialSupply) {
        initialSupply = ethers.utils.parseUnits(1e12.toString(), decimals)
    }

    const tokenContract : IERC20 = await deployContract(
        'TokenMock',
        name,
        symbol,
        decimals,
        initialSupply
    );
    
    if (initialTransfers) {
        const allAccounts = await ethers.getSigners();
        
        const owner = allAccounts[0];
        const targetAccounts = allAccounts.slice(1, 10);
        
        const amount = initialSupply.div(100);
        
        await executeInSingleBlock(async() => {
            return targetAccounts
                .map(account => {
                    return tokenContract
                        .connect(owner)
                        .transfer(account.address, amount);
                });
        });
    }
    
    return tokenContract;
}
