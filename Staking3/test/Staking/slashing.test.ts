import { RewardsClaimedEvent, RewardsSlashedEvent, TransferEvent } from '@/Staking';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';
import { findEvent, mineBlock, tokenFormat } from '../helpers/utils';
import { TestContext } from './TestContext';



type RewardPoolState = {
    unspentAmount : BigNumber;
    timespan : BigNumber;
    expiresAt : BigNumber;
    rewardsRate : BigNumber;
    totalShares : BigNumber;
    accumulator : BigNumber;
}


describe('Slashing', async() => {
    let owner : SignerWithAddress;
    let alice : SignerWithAddress;
    
    let testContext : TestContext;
    
    
    beforeEach(async() => {
        testContext = new TestContext();
        
        await testContext.initAccounts();
        await testContext.initStakingContract();
        
        await testContext.initRewardTokens();
        
        [ owner, alice ] = await ethers.getSigners();
        
        
        await testContext.createRewardPool(
            'rewardA',
            tokenFormat(1000000), // 100 ups
            10000
        );
        await testContext.createRewardPool(
            'rewardB',
            tokenFormat(4000000), // 200 ups
            20000
        );
        
        // setup slashing
        {
            const tx = await testContext.stakingContract
                .connect(owner)
                .changeSlashingParams(
                    1000,
                    4e5
                );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
    });
    
    
    it('Slash rewards when unstaking too early', async() => {
        // Inital staking (25%, 25%, 50%)
        {
            await testContext.executeInSingleBlock(async() => {
                return await testContext.stakeTokens({
                    alice: tokenFormat(10000),
                });
            });
        }
        
        // get some rewards
        {
            testContext.localDistributeRewards({ alice: 1 }, 100);
            await mineBlock(100);
        }
        
        // save data
        const rewardPoolStates : RewardPoolState[] = [];
        
        const preContractBalances : { [name: string] : BigNumber } = {};
        const preAliceBalances : { [name: string] : BigNumber } = {};
        
        for (const [pid, rewardPool] of Object.entries(testContext.rewardPools)) {
            const tokenName = rewardPool.rewardTokenName;
            
            rewardPoolStates[pid] = await testContext.stakingContract.rewardPools(pid);
            
            preContractBalances[tokenName] = await testContext.tokenContracts[tokenName]
                .balanceOf(testContext.stakingContract.address);
            preAliceBalances[tokenName] = await testContext.tokenContracts[tokenName]
                .balanceOf(alice.address);
        }
        
        // withdraw
        testContext.localDistributeRewards({ alice: 1 }, 100);
        
        const txs : ContractTransaction[] = <any>await testContext.executeInSingleBlock(async() => {
            return [
                testContext.stakingContract
                    .connect(alice)
                    .withdraw()
            ];
        }, 100);
        
        const result = await txs[0].wait();
        
        for (const [ pid, rewardPool ] of Object.entries(testContext.rewardPools)) {
            const tokenName = rewardPool.rewardTokenName;
            
            const leftAmount = testContext.accountsState.alice.claimableRewards[pid].mul(6).div(10);
            const slashAmount = testContext.accountsState.alice.claimableRewards[pid].mul(4).div(10);
            
            const eventSlash = findEvent<RewardsSlashedEvent>(result, 'RewardsSlashed', Number(pid));
            expect(eventSlash.args.amount).to.be.equal(slashAmount);
            
            const eventClaim = findEvent<RewardsClaimedEvent>(result, 'RewardsClaimed', Number(pid));
            expect(eventClaim.args.amount).to.be.equal(leftAmount);
            
            const eventTransfer = findEvent<TransferEvent>(result, 'Transfer', Number(pid));
            expect(eventTransfer.args.from).to.be.equal(testContext.stakingContract.address);
            expect(eventTransfer.args.to).to.be.equal(alice.address);
            expect(eventTransfer.args.value).to.be.equal(leftAmount);
        }
        
        // check balances
        for (const [pid, rewardPool] of Object.entries(testContext.rewardPools)) {
            const tokenName = rewardPool.rewardTokenName;
            
            const leftAmount = testContext.accountsState.alice.claimableRewards[pid].mul(6).div(10);
            
            const postContractBalance = await testContext.tokenContracts[tokenName]
                .balanceOf(testContext.stakingContract.address);
            const deltaContractBalance = preContractBalances[tokenName].sub(postContractBalance);
            expect(deltaContractBalance).to.be.equal(leftAmount);
            
            const postAliceBalance = await testContext.tokenContracts[tokenName]
                .balanceOf(alice.address);
            const deltaAliceBalance = postAliceBalance.sub(preAliceBalances[tokenName]);
            expect(deltaContractBalance).to.be.equal(leftAmount);
        }
        
        // check proper values in contract after slashing
        for (const [pid, rewardPool] of Object.entries(testContext.rewardPools)) {
            const tokenName = rewardPool.rewardTokenName;
            
            const spentAmount = testContext.accountsState.alice.claimableRewards[pid].mul(6).div(10);
            
            const previousState = rewardPoolStates[pid];
            const currentState = await testContext.stakingContract.rewardPools(pid);
            
            const unspentAmountDelta = previousState.unspentAmount
                .sub(currentState.unspentAmount);
            
            expect(unspentAmountDelta).to.be.equal(spentAmount);
        }
    });
    
    
    it('Should not slash if not neccessary', async() => {
        // Inital staking (25%, 25%, 50%)
        {
            await testContext.executeInSingleBlock(async() => {
                return await testContext.stakeTokens({
                    alice: tokenFormat(10000),
                });
            });
        }
        
        // wait enough
        {
            testContext.localDistributeRewards({ alice: 1 }, 1000);
            await mineBlock(1000);
        }
    
        // withdraw
        testContext.localDistributeRewards({ alice: 1 }, 1);
        
        const tx = await testContext.stakingContract
            .connect(alice)
            .withdraw();
        const result = await tx.wait();
        
        // no slash event
        const events = result.events.filter(e => e.event == 'RewardsSlashed');
        expect(events.length).to.be.equal(0);
        
        // full withdrawal
        for (const [ pid, rewardPool ] of Object.entries(testContext.rewardPools)) {
            const tokenName = rewardPool.rewardTokenName;
            
            const amount = testContext.accountsState.alice.claimableRewards[pid];
            
            const eventClaim = findEvent<RewardsClaimedEvent>(result, 'RewardsClaimed', Number(pid));
            expect(eventClaim.args.amount).to.be.equal(amount);
            
            const eventTransfer = findEvent<TransferEvent>(result, 'Transfer', Number(pid));
            expect(eventTransfer.args.from).to.be.equal(testContext.stakingContract.address);
            expect(eventTransfer.args.to).to.be.equal(alice.address);
            expect(eventTransfer.args.value).to.be.equal(amount);
        }
    });
});
