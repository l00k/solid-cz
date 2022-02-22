import { TypedEvent } from '@/common';
import { smock } from '@defi-wonderland/smock';
import { Block } from '@ethersproject/abstract-provider';
import { ContractReceipt } from '@ethersproject/contracts/src.ts/index';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import { BigNumber, BigNumberish, ContractTransaction, Event } from 'ethers';
import { ethers, network } from 'hardhat';

chai.use(chaiSubset);
chai.use(smock.matchers);


export type Signers = {
    owner: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    carol: SignerWithAddress,
    dave: SignerWithAddress,
    eva: SignerWithAddress,
};

export async function getSigners() : Promise<Signers>
{
    const [owner, alice, bob, carol, dave, eva ] = await ethers.getSigners();
    return { owner, alice, bob, carol, dave, eva };
}


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

export async function mineBlock (delay : number = 10) : Promise<Block>
{
    const previousBlock = await ethers.provider.getBlock('latest');
    const nextTimestamp = previousBlock.timestamp + delay;
    await network.provider.send('evm_setNextBlockTimestamp', [ nextTimestamp ]);
    await network.provider.send('evm_mine');
    return ethers.provider.getBlock('latest');
}


export type AccountCallback = (account : SignerWithAddress) => Promise<ContractTransaction>;

export async function assertIsAvailableOnlyForOwner(
    callback : AccountCallback,
    ownerOverride? : SignerWithAddress,
    errorMessage : string = 'Ownable: caller is not the owner'
)
{
    let { owner, alice, bob, carol, dave, eva } = await getSigners();
    
    if (ownerOverride) {
        owner = ownerOverride;
    }

    const nonOwnerAccounts = [ owner, alice, bob, carol, dave, eva ]
        .filter(account => account.address != owner.address)
        .slice(0, 2);

    for (const account of nonOwnerAccounts) {
        const nonOwnerTx = callback(account);
        await assertErrorMessage(nonOwnerTx, errorMessage);
    }

    const ownerTx = await callback(owner);
    const result = await ownerTx.wait();
    expect(result.status).to.be.equal(1);
}

export function assertEvent<T extends TypedEvent> (
    result : ContractReceipt,
    eventName : string,
    eventArgs : Partial<T['args']>
)
{
    const event = findEvent(result, eventName);
    
    for (const [property, value] of Object.entries(eventArgs)) {
        expect(event.args[property]).to.be.equal(value);
    }
}

export async function assertErrorMessage (
    txPromise : Promise<any>,
    message : string
) : Promise<void>
{
    return txPromise.then(
        (value) => {
            expect.fail(`Found value instead of error: ${value}`);
        },
        (reason) => {
            expect(reason.message).to.contain(message);
        }
    );
}

type AccountBalanceMap = { [address : string] : BigNumberish };
export async function assertEtherBalanceChange (
    promise : () => Promise<AccountBalanceMap>,
    balanceChange : AccountBalanceMap,
)
{
    const balancesBefore : AccountBalanceMap = {};
    for (const account in balanceChange) {
        balancesBefore[account] = await ethers.provider.getBalance(account);
    }
    
    const fees : AccountBalanceMap = await promise();
    
    // check change
    for (const account in balanceChange) {
        const currentBalance = await ethers.provider.getBalance(account);
        let delta = currentBalance
            .sub(balancesBefore[account]);
        
        if (fees?.[account]) {
            delta = delta.add(fees?.[account]);
        }
        
        expect(delta).to.be.equal(balanceChange[account]);
    }
}


export function tokenFormat (amount : BigNumberish, decimals : number = 18) : BigNumber
{
    return BigNumber.from(amount).mul(BigNumber.from(10).pow(decimals));
}


export function compareBigNumbers(
    expected : BigNumberish,
    actual : BigNumberish,
    digits : number = 8,
    desc : string = ''
)
{
    const delta = BigNumber.from(expected.toString())
        .sub(BigNumber.from(actual.toString()))
        .div(BigNumber.from(10).pow(digits));
    
    if (delta.toString() != '0') {
        expect.fail(`BigNumbers don't match\n\tE: ${expected.toString()}\n\tA: ${actual.toString()}\n${digits} digits\n${desc}`);
    }
}


type TxCheckCallback = (tx : ContractTransaction, reciept : ContractReceipt) => void;

export async function waitForTxs (txs : ContractTransaction[], checkCallback? : TxCheckCallback): Promise<ContractReceipt[]>
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

export async function txExec (txPromise : Promise<ContractTransaction>): Promise<[ ContractTransaction, ContractReceipt ]>
{
    const tx = await txPromise;
    const result = await tx.wait();
    
    expect(result.status).to.be.equal(1);
    
    return [ tx, result ];
}
