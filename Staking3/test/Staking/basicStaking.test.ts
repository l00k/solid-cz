import { Staking, TokenStakedEvent } from '@/Staking';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { assertErrorMessage, findEvent, tokenFormat } from '../helpers/utils';
import { TestContext } from './TestContext';


xdescribe('Basic staking actions', async() => {
    let owner : SignerWithAddress;
    let alice : SignerWithAddress;
    
    let testContext : TestContext;
    
    
    beforeEach(async() => {
        testContext = new TestContext();
        
        await testContext.initAccounts();
        await testContext.initStakingContract();
        
        [ owner, alice ] = await ethers.getSigners();
    });
    
    describe('Staking', async() => {
        beforeEach(async() => {
            // approve
            {
                const tx = await testContext.tokenContracts.staking
                    .connect(alice)
                    .approve(
                        testContext.stakingContract.address,
                        tokenFormat(1000)
                    );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
        });
        
        it('Properly validate arguments', async() => {
            {
                const tx = testContext.stakingContract.connect(owner).stake(0);
                await assertErrorMessage(tx, 'InvalidArgument()');
            }
        });
        
        it('Require sufficient amount of allowed tokens', async() => {
            {
                const tx = testContext.stakingContract.connect(alice).stake(tokenFormat(1001));
                await assertErrorMessage(tx, `InsufficientAllowance(${tokenFormat(1001)}, ${tokenFormat(1000)})`);
            }
            
            {
                const tx = await testContext.stakingContract.connect(alice).stake(tokenFormat(100));
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            {
                const tx = testContext.stakingContract.connect(alice).stake(tokenFormat(901));
                await assertErrorMessage(tx, `InsufficientAllowance(${tokenFormat(901)}, ${tokenFormat(900)})`);
            }
        });
        
        it('Properly transfers staked tokens', async() => {
            {
                const balanceBefore = await testContext.tokenContracts.staking.balanceOf(alice.address);
                
                const tx = await testContext.stakingContract.connect(alice).stake(tokenFormat(1000));
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                
                const event = findEvent<TokenStakedEvent>(result, 'TokenStaked');
                expect(event.args.amount).to.be.equal(tokenFormat(1000));
                
                const balanceAfter = await testContext.tokenContracts.staking.balanceOf(alice.address);
                const delta = balanceBefore.sub(balanceAfter);
                expect(delta).to.be.equal(tokenFormat(1000));
            }
        });
        
        it('Creates proper amount of share tokens', async() => {
            // check state before any action
            {
                const stake = await testContext.stakingContract.balanceOf(alice.address);
                expect(stake).to.be.equal(0);
            }
            
            {
                const tx = await testContext.stakingContract.connect(alice).stake(tokenFormat(100));
                const result = await tx.wait();
                
                expect(result.status).to.be.equal(1);
                
                const stake = await testContext.stakingContract.balanceOf(alice.address);
                expect(stake).to.be.equal(tokenFormat(100));
            }
            
            {
                const tx = await testContext.stakingContract.connect(alice).stake(tokenFormat(150));
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                
                const stake = await testContext.stakingContract.balanceOf(alice.address);
                expect(stake).to.be.equal(tokenFormat(250));
            }
        });
    });
    
    describe('Withdrawing', async() => {
        beforeEach(async() => {
            // approve
            {
                const tx = await testContext.tokenContracts.staking.connect(alice)
                    .approve(
                        testContext.stakingContract.address,
                        tokenFormat(10000)
                    );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // stake
            {
                const tx = await testContext.stakingContract.connect(alice)
                    .stake(
                        tokenFormat(1000)
                    );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
        });
        
        it('Properly transfers staked tokens', async() => {
            {
                const balanceBefore = await testContext.tokenContracts.staking.balanceOf(alice.address);
                
                const tx = await testContext.stakingContract.connect(alice).withdraw();
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                
                const event = findEvent<TokenStakedEvent>(result, 'TokenWithdrawn');
                expect(event.args.amount).to.be.equal(tokenFormat(1000));
                
                const balanceAfter = await testContext.tokenContracts.staking.balanceOf(alice.address);
                const delta = balanceAfter.sub(balanceBefore);
                expect(delta).to.be.equal(tokenFormat(1000));
            }
        });
        
        it('Destroys proper amount of share tokens', async() => {
            // check state before any action
            {
                const stake = await testContext.stakingContract.balanceOf(alice.address);
                expect(stake).to.be.equal(tokenFormat(1000));
            }
            
            {
                const tx = await testContext.stakingContract.connect(alice).withdraw();
                const result = await tx.wait();
                
                expect(result.status).to.be.equal(1);
                
                const stake = await testContext.stakingContract.balanceOf(alice.address);
                expect(stake).to.be.equal(0);
            }
        });
    });
    
});
