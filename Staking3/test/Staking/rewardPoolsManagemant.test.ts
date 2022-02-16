import { RewardPoolCreatedEvent, RewardPoolModifiedEvent } from '@/Staking';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { assertErrorMessage, assertIsAvailableOnlyForOwner, findEvent, mineBlock, tokenFormat } from '../helpers/utils';
import { RewardPool, TestContext } from './TestContext';


const day = 24 * 3600;
const month = 30 * day;

const EXTRA_TIME = 100;


describe('Reward pools management', async() => {
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
    });
    
    
    describe('Creating reward pool', async() => {
        
        it('Properly validate arguments', async() => {
            {
                const tx = testContext.stakingContract
                    .connect(owner)
                    .createRewardsPool(
                        testContext.tokenContracts.rewardA.address,
                        0,
                        month
                    );
                await assertErrorMessage(tx, 'InvalidArgument()');
            }
            
            {
                const tx = testContext.stakingContract
                    .connect(owner)
                    .createRewardsPool(
                        testContext.tokenContracts.rewardA.address,
                        1000,
                        0
                    );
                await assertErrorMessage(tx, 'InvalidArgument()');
            }
        });
        
        it('Require sufficient amount of allowed tokens', async() => {
            {
                const tx = await testContext.tokenContracts.rewardA
                    .connect(owner)
                    .approve(
                        testContext.stakingContract.address,
                        tokenFormat(1000)
                    );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // create by owner without sufficient amount
            {
                const tx = testContext.stakingContract.connect(owner).createRewardsPool(
                    testContext.tokenContracts.rewardA.address,
                    tokenFormat(10000),
                    month
                );
                await assertErrorMessage(tx, `InsufficientAllowance(${tokenFormat(10000)}, ${tokenFormat(1000)})`);
            }
            
            // approve more tokens to contract
            {
                const tx = await testContext.tokenContracts.rewardA.connect(owner).approve(
                    testContext.stakingContract.address,
                    tokenFormat(10000)
                );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // create by owner with require amount
            {
                const tx = await testContext.stakingContract.connect(owner).createRewardsPool(
                    testContext.tokenContracts.rewardA.address,
                    tokenFormat(10000),
                    month
                );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
        });
        
        it('Allow creating rewards pool only by owner', async() => {
            await assertIsAvailableOnlyForOwner(async(account) => {
                {
                    const tx = await testContext.tokenContracts.rewardA
                        .connect(account)
                        .approve(
                            testContext.stakingContract.address,
                            tokenFormat(10000)
                        );
                    const result = await tx.wait();
                    expect(result.status).to.be.equal(1);
                }
                
                return testContext.stakingContract
                    .connect(account)
                    .createRewardsPool(
                        testContext.tokenContracts.rewardA.address,
                        tokenFormat(10000),
                        month
                    );
            });
        });
        
        it('Allow creating rewards pool only before first stake', async() => {
            await testContext.createRewardPool(
                'rewardA',
                tokenFormat(1000),
                1000
            );
            
            // first stake
            await testContext.stakeTokens({
                alice: tokenFormat(100)
            });
            
            // it should be not possible to create reward pool anymore
            {
                const tx = await testContext.tokenContracts.rewardA
                    .connect(owner)
                    .approve(
                        testContext.stakingContract.address,
                        tokenFormat(10000)
                    );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            {
                const tx = testContext.stakingContract
                    .connect(owner)
                    .createRewardsPool(
                        testContext.tokenContracts.rewardA.address,
                        tokenFormat(10000),
                        month
                    );
                await assertErrorMessage(tx, 'AlreadyStarted()');
            }
        });
        
        it('Properly creates new pool', async() => {
            // approve tokens to contract
            {
                const tx = await testContext.tokenContracts.rewardA.connect(owner).approve(
                    testContext.stakingContract.address,
                    tokenFormat(10000)
                );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // create by owner with require amount
            {
                const balanceBefore = await testContext.tokenContracts.rewardA.balanceOf(owner.address);
                
                const tx = await testContext.stakingContract.connect(owner).createRewardsPool(
                    testContext.tokenContracts.rewardA.address,
                    tokenFormat(10000),
                    month
                );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                
                const block = await ethers.provider.getBlock('latest');
                
                // check event
                const poolCreated = findEvent<RewardPoolCreatedEvent>(result, 'RewardPoolCreated');
                expect(poolCreated.args.pid).to.be.equal(0);
                expect(poolCreated.args.amount).to.be.equal(tokenFormat(10000));
                expect(poolCreated.args.timespan).to.be.equal(month);
                
                // check state
                const rewardPools = await testContext.stakingContract.rewardPools(0);
                expect(rewardPools.token).to.be.equal(testContext.tokenContracts.rewardA.address);
                expect(rewardPools.unspentAmount).to.be.equal(tokenFormat(10000));
                expect(rewardPools.rewardsRate).to.be.equal(tokenFormat(10000).div(month));
                expect(rewardPools.expiresAt).to.be.equal(block.timestamp + month + EXTRA_TIME);
                expect(rewardPools.timespan).to.be.equal(month);
            }
        });
        
        it('Properly reduces creator`s balance', async() => {
            const balanceBefore = await testContext.tokenContracts.rewardA.balanceOf(owner.address);
            
            await testContext.createRewardPool(
                'rewardA',
                tokenFormat(1000),
                1000
            );
            
            const balanceAfter = await testContext.tokenContracts.rewardA.balanceOf(owner.address);
            const delta = balanceBefore.sub(balanceAfter);
            expect(delta).to.be.equal(tokenFormat(1000));
        });
        
    });
    
    
    describe('Modifing reward pool', async() => {
        let rewardPool : RewardPool;
        
        
        beforeEach(async() => {
            rewardPool = await testContext.createRewardPool(
                'rewardA',
                tokenFormat(1000),
                1000
            );
        });
        
        
        it('Properly validate arguments', async() => {
            // wrong timespan
            {
                const tx = testContext.stakingContract
                    .connect(owner)
                    .modifyRewardPool(rewardPool.pid, 0);
                await assertErrorMessage(tx, 'InvalidArgument()');
            }
            
            // wrong pool id
            {
                const tx = testContext.stakingContract
                    .connect(owner)
                    .modifyRewardPool(9999, 1000);
                await assertErrorMessage(tx, 'InvalidArgument()');
            }
            
            // expired pool
            {
                await mineBlock(1101);
                
                const tx = testContext.stakingContract
                    .connect(owner)
                    .modifyRewardPool(rewardPool.pid, 1000);
                await assertErrorMessage(tx, 'ExpiredPool()');
            }
            
            // wrong timespan
            {
                const tx = testContext.stakingContract
                    .connect(owner)
                    .modifyAllRewardPools(0);
                await assertErrorMessage(tx, 'InvalidArgument()');
            }
        });
        
        it('Allow to modify reward pool params only by owner', async() => {
            await assertIsAvailableOnlyForOwner(async(account) => {
                return testContext.stakingContract
                    .connect(account)
                    .modifyRewardPool(
                        rewardPool.pid,
                        1000
                    );
            });
        });
        
        it('Properly modify reward pool params', async() => {
            // modify by owner
            {
                const tx = await testContext.stakingContract.connect(owner).modifyAllRewardPools(1000);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                
                const block = await ethers.provider.getBlock('latest');
                
                // event
                const event = findEvent<RewardPoolModifiedEvent>(result, 'RewardPoolModified');
                expect(event.args.pid).to.be.equal(0);
                expect(event.args.timespan).to.be.equal(1000);
                
                // check state
                const rewardPoolState = await testContext.stakingContract.rewardPools(rewardPool.pid);
                
                expect(rewardPoolState.unspentAmount).to.be.equal(tokenFormat(1000));
                expect(rewardPoolState.rewardsRate).to.be.equal(tokenFormat(1000).div(1000));
                expect(rewardPoolState.expiresAt).to.be.equal(block.timestamp + 1000 + EXTRA_TIME);
                expect(rewardPoolState.timespan).to.be.equal(1000);
            }
        });
        
    });
    
});
