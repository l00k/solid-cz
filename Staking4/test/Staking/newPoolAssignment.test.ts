import { AssignedToPoolEvent } from '@/Staking';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { assertErrorMessage, assertIsAvailableOnlyForOwner, findEvent, tokenFormat } from '../helpers/utils';
import { TestContext } from './TestContext';



describe('Rewards distribution', async() => {
    let owner : SignerWithAddress;
    let alice : SignerWithAddress;
    let bob : SignerWithAddress;
    let carol : SignerWithAddress;
    let dave : SignerWithAddress;
    let eva : SignerWithAddress;
    
    let testContext : TestContext;
    
    
    
    beforeEach(async() => {
        testContext = new TestContext();
        
        await testContext.initAccounts();
        await testContext.initStakingContract();
        
        await testContext.initRewardTokens();
        
        [ owner, alice, bob, carol, dave, eva ] = await ethers.getSigners();
        
        // Sample reward pool
        await testContext.createRewardPool(
            'rewardA',
            tokenFormat(1000000), // 100 ups
            10000
        );
        
        // Initial staking
        await testContext.executeInSingleBlock(async() => {
            return await testContext.stakeTokens({
                alice: tokenFormat(20000),
                bob: tokenFormat(30000),
            });
        });
    });

    
    
    it('Should not be assigned to new pool', async() => {
        const initalBlock = await ethers.provider.getBlock('latest');
    
        // create new pool
        const newRewardPool = await testContext.createRewardPool(
            'rewardB',
            tokenFormat(4000000), // 200 ups
            20000
        );
        
        // additional stake to first pool
        {
            const currentBlock = await ethers.provider.getBlock('latest');
            const time = 100 - (currentBlock.timestamp - initalBlock.timestamp);
            
            testContext.localDistributeRewards({
                alice:  0.4,
                bob:    0.6,
            }, [100, 0])
            
            await testContext.executeInSingleBlock(async() => {
                return await testContext.stakeTokens({
                    carol: tokenFormat(60000),
                });
            }, time);
            
            // directly after staking
            await testContext.verifyAccountsState('alice', 'bob', 'carol');
            await testContext.verifyShares({
                alice:  [ 0.2, 0 ],
                bob:    [ 0.3, 0 ],
                carol:  [ 0.5, 0 ]
            });
        }
        
        // check new pool
        {
            const rewardPool = await testContext.stakingContract.rewardPools(newRewardPool.pid);
            
            expect(rewardPool.totalShares).to.be.eq(0);
            
            // Should not have share in new pool
            for (const accountName of [ 'alice', 'bob', 'carol' ]) {
                const account = testContext.accounts[accountName];
                
                const stakerShare = await testContext.stakingContract
                    .stakerShareRatio(
                        newRewardPool.pid,
                        account.address
                    );
                expect(stakerShare).to.be.equal(0);
            }
        }
    });
    
    it('Only owner should be able to assign all stakers', async() => {
        // create new pool
        const newRewardPool = await testContext.createRewardPool(
            'rewardB',
            tokenFormat(4000000), // 200 ups
            20000
        );
        
        await assertIsAvailableOnlyForOwner(async(account) => {
            return testContext.stakingContract
                .connect(account)
                .assignAllToNewPool(newRewardPool.pid);
        });
    });
    
    it('Should properly handle assigning all stakers', async() => {
        // create new pool
        const newRewardPool = await testContext.createRewardPool(
            'rewardB',
            tokenFormat(4000000), // 200 ups
            20000
        );
        
        const tx = await testContext.stakingContract
            .connect(owner)
            .assignAllToNewPool(newRewardPool.pid);
        const result = await tx.wait();
        
        expect(result.status).to.be.equal(1);
        
        for (const [offset, accountName] of Object.entries([ 'alice', 'bob' ])) {
            const account = testContext.accounts[accountName];
        
            const event = findEvent<AssignedToPoolEvent>(result, 'AssignedToPool', Number(offset));
            expect(event.args.pid).to.be.equal(newRewardPool.pid);
            expect(event.args.staker).to.be.equal(account.address);
        }
        
        // verify shares
        await testContext.verifyShares({
            alice:  [ 0.4, 0.4 ],
            bob:    [ 0.6, 0.6 ],
        });
    });
    
    it('Should allow anyone to self assign', async() => {
        // create new pool
        const newRewardPool = await testContext.createRewardPool(
            'rewardB',
            tokenFormat(4000000), // 200 ups
            20000
        );
        
        const tx = await testContext.stakingContract
            .connect(alice)
            .assignMeToNewPool(newRewardPool.pid);
        const result = await tx.wait();
        
        expect(result.status).to.be.equal(1);
        
        const event = findEvent<AssignedToPoolEvent>(result, 'AssignedToPool');
        expect(event.args.pid).to.be.equal(newRewardPool.pid);
        expect(event.args.staker).to.be.equal(alice.address);
        
        // verify shares
        await testContext.verifyShares({
            alice:  [ 0.4, 1 ],
            bob:    [ 0.6, 0 ],
        });
    });
    
    it('Should not allow to assign twice', async() => {
        // create new pool
        const newRewardPool = await testContext.createRewardPool(
            'rewardB',
            tokenFormat(4000000), // 200 ups
            20000
        );
    
        {
            const tx = await testContext.stakingContract
                .connect(alice)
                .assignMeToNewPool(newRewardPool.pid);
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        {
            const tx = testContext.stakingContract
                .connect(alice)
                .assignMeToNewPool(newRewardPool.pid);
            assertErrorMessage(tx, 'AlreadyAssigned()');
        }
    });
    
});
