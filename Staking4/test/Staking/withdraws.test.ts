import { RewardsClaimedEvent, TransferEvent } from '@/Staking';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, ContractTransaction } from 'ethers';
import { ethers, network } from 'hardhat';
import { findEvent, mineBlock, tokenFormat, waitForTxs } from '../helpers/utils';
import { TestContext } from './TestContext';



describe('Withdrawing', async() => {
    let owner : SignerWithAddress;
    let alice : SignerWithAddress;
    
    let testContext : TestContext;
    
    
    beforeEach(async() => {
        testContext = new TestContext();
        
        await testContext.initAccounts();
        await testContext.initStakingContract();
        
        await testContext.initRewardTokens();
        
        [ owner, alice ] = await ethers.getSigners();
    });
    
    
    it('Should do nothing when requesting withdrawal without stake', async() => {
        await testContext.createRewardPool(
            'rewardA',
            tokenFormat(1000000), // 100 ups
            10000
        );
        
        const tx = await testContext.stakingContract
            .connect(alice).withdraw();
        const result = await tx.wait();
        
        expect(result.status).to.be.equal(1);
        expect(result.events.length).to.be.equal(0);
    });
    
    
    it('Properly transfer tokens while withdrawing with rewards', async() => {
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
                    alice: tokenFormat(10000),
                    bob: tokenFormat(10000),
                    carol: tokenFormat(20000),
                });
            });
        }
        
        // Alice withdraws rewards
        {
            const preContractBalances : { [name: string] : BigNumber } = {};
            const preAliceBalances : { [name: string] : BigNumber } = {};
            
            for (const [tokenName, tokenConfig] of Object.entries(testContext.tokenConfigs)) {
                preContractBalances[tokenName] = await testContext.tokenContracts[tokenName]
                    .balanceOf(testContext.stakingContract.address);
                preAliceBalances[tokenName] = await testContext.tokenContracts[tokenName]
                    .balanceOf(alice.address);
            }
            
            // adjust local rewards state
            testContext.localDistributeRewards({
                alice: 0.25,
                bob: 0.25,
                carol: 0.5
            }, 100);
            
            // claim rewards
            const txs : ContractTransaction[] = <any> await testContext.executeInSingleBlock(async() => {
                return [
                    testContext.stakingContract
                        .connect(alice)
                        .withdraw()
                ];
            }, 100);
            
            const result = await txs[0].wait();
            
            // check events
            for (const [pid, rewardPool] of Object.entries(testContext.rewardPools)) {
                const tokenName = rewardPool.rewardTokenName;
                
                const eventClaim = findEvent<RewardsClaimedEvent>(result, 'RewardsClaimed', Number(pid));
                expect(eventClaim.args.amount).to.be.equal(testContext.accountsState.alice.claimableRewards[pid]);
                
                const eventTransfer = findEvent<TransferEvent>(result, 'Transfer', Number(pid));
                expect(eventTransfer.args.from).to.be.equal(testContext.stakingContract.address);
                expect(eventTransfer.args.to).to.be.equal(alice.address);
                expect(eventTransfer.args.value).to.be.equal(testContext.accountsState.alice.claimableRewards[pid]);
            }
            
            const eventTransfer = findEvent<TransferEvent>(result, 'Transfer', testContext.rewardPools.length+1);
            expect(eventTransfer.args.from).to.be.equal(testContext.stakingContract.address);
            expect(eventTransfer.args.to).to.be.equal(alice.address);
            expect(eventTransfer.args.value).to.be.equal(testContext.accountsState.alice.staked);
            
            
            // check balances
            const balancesToCheck = [
                { tokenName: 'staking', targetValue: testContext.accountsState.alice.staked },
                { tokenName: 'rewardA', targetValue: testContext.accountsState.alice.claimableRewards[0] },
                { tokenName: 'rewardB', targetValue: testContext.accountsState.alice.claimableRewards[1] },
            ]
            
            for (const { tokenName, targetValue } of balancesToCheck) {
                const postContractBalance = await testContext.tokenContracts[tokenName]
                    .balanceOf(testContext.stakingContract.address);
                const deltaContractBalance = preContractBalances[tokenName].sub(postContractBalance);
                expect(deltaContractBalance).to.be.equal(targetValue);
                
                const postAliceBalance = await testContext.tokenContracts[tokenName]
                    .balanceOf(alice.address);
                const deltaAliceBalance = postAliceBalance.sub(preAliceBalances[tokenName]);
                expect(deltaContractBalance).to.be.equal(targetValue);
            }
        }
    });
    
});
