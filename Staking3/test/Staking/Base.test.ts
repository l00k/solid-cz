import { ExtERC20 } from '@/ExtERC20';
import { Staking, TokenStakedEvent } from '@/Staking';
import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { Factory } from '../fixtures/contracts';
import { createTokens } from '../fixtures/tokens';
import { assertErrorMessage, findEvent, tokenFormat } from '../helpers/utils';



describe('Base', async() => {
    let owner, alice, bob, carol, dave;
    let stakeToken : ExtERC20;
    let stakingContract : Staking;
    
    beforeEach(async() => {
        [ owner, alice, bob, carol, dave ] = await ethers.getSigners();
        [ stakeToken ] = await createTokens('staking');
        
        stakingContract = await Factory.Staking(stakeToken.address);
    });
    
    describe('Staking', async() => {
        beforeEach(async() => {
            // approve
            {
                const tx = await stakeToken.connect(alice).approve(
                    stakingContract.address,
                    tokenFormat(1000)
                );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
        });
    
        it('Properly validate arguments', async() => {
            {
                const tx = stakingContract.connect(owner).stake(0);
                await assertErrorMessage(tx, 'InvalidArgument()');
            }
        });
        
        it('Require sufficient amount of allowed tokens', async() => {
            {
                const tx = stakingContract.connect(alice).stake(tokenFormat(1001));
                await assertErrorMessage(tx, `InsufficientAllowance(${tokenFormat(1001)}, ${tokenFormat(1000)})`);
            }
            
            {
                const tx = await stakingContract.connect(alice).stake(tokenFormat(100));
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            {
                const tx = stakingContract.connect(alice).stake(tokenFormat(901));
                await assertErrorMessage(tx, `InsufficientAllowance(${tokenFormat(901)}, ${tokenFormat(900)})`);
            }
        });
        
        it('Properly transfers staked tokens', async() => {
            {
                const balanceBefore = await stakeToken.balanceOf(alice.address);
                
                const tx = await stakingContract.connect(alice).stake(tokenFormat(1000));
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                
                const event = findEvent<TokenStakedEvent>(result, 'TokenStaked');
                expect(event.args.amount).to.be.equal(tokenFormat(1000));
                
                const balanceAfter = await stakeToken.balanceOf(alice.address);
                const delta = balanceBefore.sub(balanceAfter);
                expect(delta).to.be.equal(tokenFormat(1000));
            }
        });
        
        it('Creates proper amount of share tokens', async() => {
            // check state before any action
            {
                const stake = await stakingContract.balanceOf(alice.address);
                expect(stake).to.be.equal(0);
            }
            
            {
                const tx = await stakingContract.connect(alice).stake(tokenFormat(100));
                const result = await tx.wait();
                
                expect(result.status).to.be.equal(1);
                
                const stake = await stakingContract.balanceOf(alice.address);
                expect(stake).to.be.equal(tokenFormat(100));
            }
            
            {
                const tx = await stakingContract.connect(alice).stake(tokenFormat(150));
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                
                const stake = await stakingContract.balanceOf(alice.address);
                expect(stake).to.be.equal(tokenFormat(250));
            }
        });
    });
    
    describe('Withdrawing', async() => {
        beforeEach(async() => {
            // approve
            {
                const tx = await stakeToken.connect(alice)
                    .approve(
                        stakingContract.address,
                        tokenFormat(10000)
                    );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // stake
            {
                const tx = await stakingContract.connect(alice)
                    .stake(
                        tokenFormat(1000)
                    );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
        });
        
        it('Properly transfers staked tokens', async() => {
            {
                const balanceBefore = await stakeToken.balanceOf(alice.address);
                
                const tx = await stakingContract.connect(alice).withdraw();
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                
                const event = findEvent<TokenStakedEvent>(result, 'TokenWithdrawn');
                expect(event.args.amount).to.be.equal(tokenFormat(1000));
                
                const balanceAfter = await stakeToken.balanceOf(alice.address);
                const delta = balanceAfter.sub(balanceBefore);
                expect(delta).to.be.equal(tokenFormat(1000));
            }
        });
        
        it('Destroys proper amount of share tokens', async() => {
            // check state before any action
            {
                const stake = await stakingContract.balanceOf(alice.address);
                expect(stake).to.be.equal(tokenFormat(1000));
            }
            
            {
                const tx = await stakingContract.connect(alice).withdraw();
                const result = await tx.wait();
                
                expect(result.status).to.be.equal(1);
                
                const stake = await stakingContract.balanceOf(alice.address);
                expect(stake).to.be.equal(0);
            }
        });
    });
    
});
