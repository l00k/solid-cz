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
    });

    
    
    xit('Should properly distribute token for single staker', async() => {
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
        
        
        // Check state before any action
        {
            await testContext.verifyAccountsState('alice');
        }
        
        // Alice stakes 1000
        {
            await testContext.executeInSingleBlock(async() => {
                return await testContext.stakeTokens({
                    alice: tokenFormat(10000)
                });
            });
            
            // directly after staking
            // rewards are still 0 (cuz no times passed since stake) but stake is increased
            await testContext.verifyAccountsState('alice');
            await testContext.verifyShares({
                alice: 1
            });
        }
        
        // Mine next block (50 seconds later)
        {
            await mineBlock(50);
            
            // Shares factor didn't change
            // Still Alice has 100% shares so she should get all rewards
            testContext.localDistributeRewards({ alice: 1 }, 50);
            
            await testContext.verifyAccountsState('alice');
            await testContext.verifyShares({
                alice: 1
            });
        }
        
        // Next stake (100 seconds later)
        // rewards should be distributed as it may change share ratio
        {
            await testContext.executeInSingleBlock(async() => {
                return await testContext.stakeTokens({
                    alice: tokenFormat(20000)
                });
            }, 100);
            
            // Alice should still have 100% shares so all rewards goes to her
            // since inital stake 100 seconds passed
            testContext.localDistributeRewards({ alice: 1 }, 100);
            
            await testContext.verifyAccountsState('alice');
            await testContext.verifyShares({
                alice: 1
            });
        }
        
        // Mine next block (100 seconds later)
        {
            await mineBlock(100);
            
            // Shares factor didn't change
            // Still Alice has 100% shares so she should get all rewards
            testContext.localDistributeRewards({ alice: 1 }, 100);
            
            await testContext.verifyAccountsState('alice');
            await testContext.verifyShares({
                alice: 1
            });
        }
        
        // Mine next block (10000 seconds later)
        // Pool 2 and 3 expired
        {
            await mineBlock(10000);
            
            testContext.localDistributeRewards({ alice: 1 }, [ 9750, 10000, 750 ]);
            
            await testContext.verifyAccountsState('alice');
            await testContext.verifyShares({
                alice: 1
            });
        }
    });


    xit('Should properly share rewards', async() => {
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
        
        
        // Inital staking (25%, 25%, 50%)
        {
            await testContext.executeInSingleBlock(async() => {
                return await testContext.stakeTokens({
                    alice:  tokenFormat(10000),
                    bob:    tokenFormat(10000),
                    carol:  tokenFormat(20000),
                });
            });

            // Directly after staking
            // rewards are still 0 (cuz no times passed since stake) but stake is increased
            await testContext.verifyAccountsState('alice', 'bob', 'carol');
            await testContext.verifyShares({
                alice:  0.25,
                bob:    0.25,
                carol:  0.50,
            });
        }

        // Mine next block (100 seconds later)
        {
            await mineBlock(100);

            // Distribute rewards
            testContext.localDistributeRewards({
                alice:  0.25,
                bob:    0.25,
                carol:  0.50,
            }, 100);

            await testContext.verifyAccountsState('alice', 'bob', 'carol');
            await testContext.verifyShares({
                alice:  0.25,
                bob:    0.25,
                carol:  0.50,
            });
        }

        // Alice stakes additional amount
        {
            await testContext.executeInSingleBlock(async() => {
                return await testContext.stakeTokens({
                    alice: tokenFormat(40000),
                });
            }, 100);

            // Distribute rewards using previous ratio
            testContext.localDistributeRewards({
                alice:  0.25,
                bob:    0.25,
                carol:  0.50,
            }, 100);

            await testContext.verifyShares({
                alice:  [ 0.55, 0.5 ],
                bob:    [ 0.15, 0.5-1/3 ],
                carol:  [ 0.30, 1/3 ],
            });
            await testContext.verifyAccountsState('alice', 'bob', 'carol');
        }

        // Mine next block (100 seconds later)
        {
            await mineBlock(150);

            // Distribute rewards using previous ratio
            testContext.localDistributeRewards({
                alice:  [ 0.55, 0.5 ],
                bob:    [ 0.15, 0.5-1/3 ],
                carol:  [ 0.30, 1/3 ],
            }, 150);

            await testContext.verifyShares({
                alice:  [ 0.55, 0.5 ],
                bob:    [ 0.15, 0.5-1/3 ],
                carol:  [ 0.30, 1/3 ],
            });
            await testContext.verifyAccountsState('alice', 'bob', 'carol');
        }

        // later new user Dave stakes
        {
            await testContext.executeInSingleBlock(async() => {
                return await testContext.stakeTokens({
                    dave: tokenFormat(80000),
                });
            }, 50);

            // Distribute rewards using previous ratio (40%, 20%, 40%)
            testContext.localDistributeRewards({
                alice:  [ 0.55, 0.5 ],
                bob:    [ 0.15, 0.5-1/3 ],
                carol:  [ 0.30, 1/3 ],
            }, 50);

            await testContext.verifyShares({
                alice:  [ 0.33, 1/3 ],
                bob:    [ 0.09, 1/9 ],
                carol:  [ 0.18, 2/9 ],
                dave:   [ 0.40, 1/3 ],
            });
            await testContext.verifyAccountsState('alice', 'bob', 'carol', 'dave');
        }
        
        // Mine next block (100 seconds later)
        {
            await mineBlock(100);

            // Shares factor didn't change
            testContext.localDistributeRewards({
                alice:  [ 0.33, 1/3 ],
                bob:    [ 0.09, 1/9 ],
                carol:  [ 0.18, 2/9 ],
                dave:   [ 0.40, 1/3 ],
            }, 100);

            await testContext.verifyShares({
                alice:  [ 0.33, 1/3 ],
                bob:    [ 0.09, 1/9 ],
                carol:  [ 0.18, 2/9 ],
                dave:   [ 0.40, 1/3 ],
            });
            await testContext.verifyAccountsState('alice', 'bob', 'carol', 'dave');
        }

        // Mine next block (10000 seconds later)
        // Pool 2 and 3 expired
        {
            await mineBlock(10000);

            testContext.localDistributeRewards({
                alice:  [ 0.33, 1/3 ],
                bob:    [ 0.09, 1/9 ],
                carol:  [ 0.18, 2/9 ],
                dave:   [ 0.40, 1/3 ],
            }, [ 9700, 10000, 700 ]);

            await testContext.verifyShares({
                alice:  [ 0.33, 1/3 ],
                bob:    [ 0.09, 1/9 ],
                carol:  [ 0.18, 2/9 ],
                dave:   [ 0.40, 1/3 ],
            });
            await testContext.verifyAccountsState('alice', 'bob', 'carol', 'dave');
        }
    });


    xit('Rewards distribution after pool change', async() => {
        await testContext.createRewardPool(
            'rewardA',
            tokenFormat(1000000), // 100 ups
            10000
        );
        
        // Alice and Bob stakes
        {
            await testContext.executeInSingleBlock(async() => {
                return await testContext.stakeTokens({
                    alice: tokenFormat(10000),
                    bob: tokenFormat(30000),
                });
            });

            // Directly after staking
            // rewards are still 0 (cuz no times passed since stake) but stake is increased
            await testContext.verifyAccountsState('alice', 'bob');
            await testContext.verifyShares({
                alice: 0.25,
                bob: 0.75
            });
        }

        // Mine next block (100 seconds later)
        {
            await mineBlock(100);

            // Shares factor didn't change
            testContext.localDistributeRewards({
                alice: 0.25,
                bob: 0.75,
            }, 100);

            await testContext.verifyAccountsState('alice', 'bob');
            await testContext.verifyShares({
                alice: 0.25,
                bob: 0.75
            });
        }

        // Change pool params
        {
            await testContext.executeInSingleBlock(async() => {
                return [
                    testContext.stakingContract
                        .connect(owner)
                        .modifyRewardPool(0, 20000)
                ];
            }, 100);

            // add and check rewards using previos ratio
            testContext.localDistributeRewards({
                alice: 0.25,
                bob: 0.75,
            }, 100);

            await testContext.verifyShares({
                alice: 0.25,
                bob: 0.75
            });

            // update new rewards per second
            testContext.rewardPools[0].rewardsRate = tokenFormat(1e6)
                .sub(testContext.accountsState.alice.claimableRewards[0])
                .sub(testContext.accountsState.bob.claimableRewards[0])
                .div(20000);

            // check reward/s in state
            const rewardPool = await testContext.stakingContract.rewardPools(0);
            expect(rewardPool.rewardsRate).to.be.equal(testContext.rewardPools[0].rewardsRate);
        }

        // Mine next block (50 seconds later)
        {
            await mineBlock(50);

            testContext.localDistributeRewards({
                alice: 0.25,
                bob: 0.75,
            }, 50);

            await testContext.verifyAccountsState('alice', 'bob');
            await testContext.verifyShares({
                alice: 0.25,
                bob: 0.75
            });
        }
        
        // Carol stakes
        {
            await testContext.executeInSingleBlock(async() => {
                return await testContext.stakeTokens({
                    carol: tokenFormat(64900),
                });
            }, 50);

            testContext.localDistributeRewards({
                alice: 0.25,
                bob: 0.75,
            }, 50);
            
            await testContext.verifyAccountsState('alice', 'bob', 'carol');
            await testContext.verifyShares({
                alice:  [ 0.125 ],
                bob:    [ 0.375 ],
                carol:  [ 0.5 ],
            });
        }
        
        // Mine next block (20000 seconds later)
        // Pool 2 and 3 expired
        {
            await mineBlock(20000);

            testContext.localDistributeRewards({
                alice:  0.125,
                bob:    0.375,
                carol:  0.5,
            }, 19900);

            await testContext.verifyAccountsState('alice', 'bob');
            await testContext.verifyShares({
                alice:  [ 0.125 ],
                bob:    [ 0.375 ],
                carol:  [ 0.5 ],
            });
        }
    });

    
    it('Rewards distribution after claiming rewards', async() => {
        await testContext.createRewardPool(
            'rewardA',
            tokenFormat(1000000), // 100 ups
            10000
        );
        
        // Alice & Bob stakes
        {
            await testContext.executeInSingleBlock(async() => {
                return await testContext.stakeTokens({
                    alice: tokenFormat(10000),
                    bob: tokenFormat(30000),
                });
            });

            // directly after staking
            await testContext.verifyAccountsState('alice', 'bob');
            await testContext.verifyShares({
                alice: 0.25,
                bob: 0.75
            });
        }

        // Mine next block (100 seconds later)
        {
            await mineBlock(100);

            // Shares factor didn't change
            testContext.localDistributeRewards({
                alice: 0.25,
                bob: 0.75,
            }, 100);

            await testContext.verifyAccountsState('alice', 'bob');
            await testContext.verifyShares({
                alice: 0.25,
                bob: 0.75
            });
        }

        // Claim rewards
        {
            await testContext.executeInSingleBlock(async() => {
                return [
                    testContext.stakingContract
                        .connect(alice)
                        .claimAllRewards()
                ];
            }, 100);

            // distribute rewards
            testContext.localDistributeRewards({
                alice: 0.25,
                bob: 0.75
            }, 100);

            // clear rewards
            testContext.accountsState.alice.balances.rewardA = testContext.accountsState.alice.balances.rewardA
                .add(testContext.accountsState.alice.claimableRewards[0]);
            testContext.accountsState.alice.claimableRewards[0] = BigNumber.from(0);

            await testContext.verifyShares({
                alice: 0.25,
                bob: 0.75
            });
        }

        // Mine next block (100 seconds later)
        {
            await mineBlock(100);

            // Shares factor didn't change
            testContext.localDistributeRewards({
                alice: 0.25,
                bob: 0.75,
            }, 100);

            await testContext.verifyAccountsState('alice', 'bob');
            await testContext.verifyShares({
                alice: 0.25,
                bob: 0.75
            });
        }
        
        // Carol stakes
        {
            await testContext.executeInSingleBlock(async() => {
                return await testContext.stakeTokens({
                    carol: tokenFormat(64900),
                });
            }, 50);

            testContext.localDistributeRewards({
                alice: 0.25,
                bob: 0.75,
            }, 50);
            
            await testContext.verifyAccountsState('alice', 'bob', 'carol');
            await testContext.verifyShares({
                alice:  [ 0.125 ],
                bob:    [ 0.375 ],
                carol:  [ 0.5 ],
            });
        }
        
        // Mine next block (500 seconds later)
        {
            await mineBlock(500);

            testContext.localDistributeRewards({
                alice:  0.125,
                bob:    0.375,
                carol:  0.5,
            }, 500);

            await testContext.verifyAccountsState('alice', 'bob');
            await testContext.verifyShares({
                alice:  [ 0.125 ],
                bob:    [ 0.375 ],
                carol:  [ 0.5 ],
            });
        }
    });


    xit('Rewards distribution after withdrawing', async() => {
        await testContext.createRewardPool(
            'rewardA',
            tokenFormat(1000000), // 100 ups
            10000
        );

        // Alice & Bob stakes
        {
            await testContext.executeInSingleBlock(async() => {
                return await testContext.stakeTokens({
                    alice: tokenFormat(10000),
                    bob: tokenFormat(30000),
                });
            });

            // directly after staking
            await testContext.verifyAccountsState('alice', 'bob');
            await testContext.verifyShares({
                alice: 0.25,
                bob: 0.75
            });
        }

        // Mine next block (100 seconds later)
        {
            await mineBlock(100);

            // Shares factor didn't change
            testContext.localDistributeRewards({
                alice: 0.25,
                bob: 0.75,
            }, 100);

            await testContext.verifyAccountsState('alice', 'bob');
            await testContext.verifyShares({
                alice: 0.25,
                bob: 0.75
            });
        }

        // Claim rewards
        {
            await testContext.executeInSingleBlock(async() => {
                return [
                    testContext.stakingContract
                        .connect(alice)
                        .withdraw()
                ];
            }, 100);

            testContext.localDistributeRewards({
                alice: 0.25,
                bob: 0.75,
            }, 100);

            // clear rewards & stake
            testContext.accountsState.alice.claimableRewards[0] = BigNumber.from(0);
            testContext.accountsState.alice.staked = BigNumber.from(0);

            await testContext.verifyAccountsState('alice', 'bob');
            await testContext.verifyShares({
                bob: 1
            });
        }

        // Mine next block (100 seconds later)
        {
            await mineBlock(100);

            // Shares factor didn't change
            testContext.localDistributeRewards({ bob: 1, }, 100);

            await testContext.verifyAccountsState('alice', 'bob');
            await testContext.verifyShares({
                bob: 1
            });
        }
    });
    
});
