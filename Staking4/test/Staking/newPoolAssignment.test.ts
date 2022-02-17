import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { mineBlock, tokenFormat } from '../helpers/utils';
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
        
        await testContext.createRewardPool(
            'rewardA',
            tokenFormat(1000000), // 100 ups
            10000
        );
    });

    
    
    it('Should not be assigned to new pool', async() => {
        // Initial staking
        {
            await testContext.executeInSingleBlock(async() => {
                return await testContext.stakeTokens({
                    alice: tokenFormat(20000),
                    bob: tokenFormat(30000),
                });
            });
            
            // directly after staking
            await testContext.verifyAccountsState('alice', 'bob', 'carol');
            await testContext.verifyShares({
                alice: 0.4,
                bob: 0.6,
            });
        }
    
        // create new pool
        const newRewardPool = await testContext.createRewardPool(
            'rewardB',
            tokenFormat(4000000), // 200 ups
            20000
        );
        
        // additional stake to first pool
        {
            await testContext.executeInSingleBlock(async() => {
                return await testContext.stakeTokens({
                    carol: tokenFormat(60000),
                });
            }, 100);
            
            // directly after staking
            await testContext.verifyAccountsState('alice', 'bob', 'carol');
            await testContext.verifyShares({
                alice: 0.2,
                bob: 0.3,
                carol: 0.5
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
    
});
