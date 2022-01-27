import { smock } from '@defi-wonderland/smock';
import { Block } from '@ethersproject/abstract-provider';
import { ContractReceipt } from '@ethersproject/contracts/src.ts/index';
import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import { ContractTransaction, Event } from 'ethers';
import { ethers, network } from 'hardhat';

chai.use(chaiSubset);
chai.use(smock.matchers);


export function findEvent<T extends Event> (result : ContractReceipt, eventName : string) : T
{
    if (!result.events?.length) {
        expect.fail(`${eventName} event not found`);
    }
    
    const event = (<Event[]>result.events)?.find(e => e.event == eventName);
    if (!event) {
        expect.fail(`${eventName} event not found`);
    }
    
    return <any>event;
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
        (value) => {
            expect.fail(`Found value instead of error: ${value}`);
        },
        (reason) => {
            expect(reason.message).to.contain(message);
        }
    );
}
