import { StakeLimitsChangedEvent } from '@/Staking';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { assertIsAvailableOnlyForOwner, findEvent, tokenFormat } from '../helpers/utils';
import { TestContext } from './TestContext';


const day = 24 * 3600;
const month = 30 * day;


describe('Stake limits management', async() => {
    let owner : SignerWithAddress;
    
    let testContext : TestContext;
    
    
    
    beforeEach(async() => {
        testContext = new TestContext();
        
        await testContext.initAccounts();
        await testContext.initStakingContract();
        
        await testContext.initRewardTokens();
        
        [ owner ] = await ethers.getSigners();
    });
    
    
    it('Allows to change stake limits only by owner', async() => {
        await assertIsAvailableOnlyForOwner(async(account) => {
            return testContext.stakingContract
                .connect(account)
                .changeStakeLimits(
                    tokenFormat(10000),
                    tokenFormat(10),
                    tokenFormat(1000)
                );
        });
    });
    
    it('Should properly change stake limits', async() => {
        const tx = await testContext.stakingContract
            .connect(owner)
            .changeStakeLimits(
                tokenFormat(10000),
                tokenFormat(10),
                tokenFormat(1000)
            );
        const result = await tx.wait();
        expect(result.status).to.be.equal(1);
        
        // check event
        const event = findEvent<StakeLimitsChangedEvent>(result, 'StakeLimitsChanged');
        expect(event.args.totalStakeLimit).to.be.equal(tokenFormat(10000));
        expect(event.args.minStakePerAccount).to.be.equal(tokenFormat(10));
        expect(event.args.maxStakePerAccount).to.be.equal(tokenFormat(1000));
        
        // check state
        const totalStakeLimit = await testContext.stakingContract.totalStakeLimit();
        expect(totalStakeLimit).to.be.equal(tokenFormat(10000));
        
        const minStakePerAccount = await testContext.stakingContract.minStakePerAccount();
        expect(minStakePerAccount).to.be.equal(tokenFormat(10));
        
        const maxStakePerAccount = await testContext.stakingContract.maxStakePerAccount();
        expect(maxStakePerAccount).to.be.equal(tokenFormat(1000));
    });
    
});
