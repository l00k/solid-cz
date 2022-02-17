import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { assertErrorMessage, tokenFormat } from '../helpers/utils';
import { TestContext } from './TestContext';


describe('Limited staking', async() => {
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
        
        // configure limits
        {
            const tx = await testContext.stakingContract
                .connect(owner)
                .changeStakeLimits(
                    tokenFormat(10000),
                    tokenFormat(10),
                    tokenFormat(1000)
                );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
    });
    
    
    it('Should not allow to stake amount less than minimal', async() => {
        // approve
        {
            const tx = await testContext.tokenContracts.staking
                .connect(alice)
                .approve(
                    testContext.stakingContract.address,
                    tokenFormat(10000)
                );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        // stake failure
        {
            const tx = testContext.stakingContract
                .connect(alice)
                .stake(tokenFormat(5));
            await assertErrorMessage(tx, `StakeBelowMinimal(${tokenFormat(10)})`);
        }
        
        // stake success
        {
            const tx = await testContext.stakingContract
                .connect(alice)
                .stake(tokenFormat(10));
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
    });
    
    it('Should not allow to stake amount more than maximal', async() => {
        // approve
        {
            const tx = await testContext.tokenContracts.staking.connect(alice).approve(
                testContext.stakingContract.address,
                tokenFormat(10000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        // stake failure
        {
            const tx = testContext.stakingContract
                .connect(alice)
                .stake(tokenFormat(1005));
            await assertErrorMessage(tx, `StakeAboveMaximal(${tokenFormat(1000)})`);
        }
        
        // stake success
        {
            const tx = await testContext.stakingContract
                .connect(alice)
                .stake(tokenFormat(1000));
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
    });
    
    it('Should not allow to stake when limit exceed', async() => {
        {
            const tx = await testContext.stakingContract
                .connect(owner)
                .changeStakeLimits(
                    tokenFormat(10000),
                    tokenFormat(10),
                    tokenFormat(20000)
                );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        // approve and stake by Alice
        await testContext.stakeTokens({
            alice: tokenFormat(9000)
        });
        
        // approve and stake by Bob
        {
            const tx = await testContext.tokenContracts.staking.connect(bob).approve(
                testContext.stakingContract.address,
                tokenFormat(10000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        {
            const tx = testContext.stakingContract
                .connect(bob)
                .stake(tokenFormat(1005));
            await assertErrorMessage(tx, `TotalStakeExceedLimit(${tokenFormat(10000)})`);
        }
    });
    
});
