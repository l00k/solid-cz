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

export async function timetravel (seconds : number) : Promise<any>
{
    await network.provider.send('evm_increaseTime', [ seconds ]);
    return network.provider.send('evm_mine');
}

export async function mineBlock (delay : number = 10) : Promise<Block>
{
    const previousBlock = await ethers.provider.getBlock('latest');
    const nextTimestamp = previousBlock.timestamp + delay;
    await network.provider.send('evm_setNextBlockTimestamp', [ nextTimestamp ]);
    await network.provider.send('evm_mine');
    return ethers.provider.getBlock('latest');
}

export async function assertErrorMessage (
    tx : Promise<ContractTransaction>,
    message : string
) : Promise<void>
{
    return tx.then(
        (value) =>
        {
            expect.fail(`Found value instead of error: ${value}`);
        },
        (reason) => {
            expect(reason.message).to.contain(message);
        }
    );
}

export function tokenFormat (amount : BigNumberish, decimals : number = 18) : BigNumber
{
    return BigNumber.from(amount).mul(BigNumber.from(10).pow(decimals));
}

type TxCheckCallback = (tx : ContractTransaction, reciept : ContractReceipt) => void;

export async function waitForTxs (txs : ContractTransaction[], checkCallback? : TxCheckCallback)
{
    for (const tx of txs) {
        const result = await tx.wait();
        expect(result.status).to.be.equal(1);
        
        if (checkCallback) {
            checkCallback(tx, result);
        }
    }
}
