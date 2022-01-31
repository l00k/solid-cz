import { Coin } from '@/Coin';
import {
    EarlyWithdrawalParamsChangedEvent,
    RewardPoolCreatedEvent,
    RewardPoolModifiedEvent,
    StakeLimitsChangedEvent,
    Staking
} from '@/Staking';
import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { Factory } from '../fixtures/contracts';
import { createTokens } from '../fixtures/tokens';
import { assertErrorMessage, findEvent, mineBlock, tokenFormat } from '../helpers/utils';


const day = 24 * 3600;
const month = 30 * day;


describe('Staking / Management', async() => {
    let creator, alice, bob, john, jane;
    let tokenMain : Coin;
    let tokenReward : Coin;
    let stakingContract : Staking;
    
    beforeEach(async() => {
        [ creator, alice, bob, john, jane ] = await ethers.getSigners();
        
        [ tokenMain, tokenReward ] = await createTokens('staking', 'reward1');
        
        stakingContract = await Factory.Staking(tokenMain.address);
    });
    
    it('Properly validate arguments', async() => {
        {
            const tx = stakingContract.connect(creator).createRewardsPool(tokenReward.address, 0, month);
            await assertErrorMessage(tx, 'WrongAmount()');
        }
        
        {
            const tx = stakingContract.connect(creator).createRewardsPool(tokenReward.address, 1000, 0);
            await assertErrorMessage(tx, 'WrongTimespan()');
        }
    });
    
    it('Allow creating rewards pool only by owner', async() => {
        // try to create by non owner
        {
            const tx = await tokenReward.connect(alice).approve(
                stakingContract.address,
                tokenFormat(10000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        {
            const tx = stakingContract.connect(alice).createRewardsPool(
                tokenReward.address,
                tokenFormat(10000),
                month
            );
            await assertErrorMessage(tx, 'Ownable: caller is not the owner');
        }
        
        // create by owner
        {
            const tx = await tokenReward.connect(creator).approve(
                stakingContract.address,
                tokenFormat(10000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        {
            const tx = await stakingContract.connect(creator).createRewardsPool(
                tokenReward.address,
                tokenFormat(10000),
                month
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
    });
    
    it('Require sufficient amount of allowed tokens', async() => {
        // first deposit tokens to contract
        {
            const tx = await tokenReward.connect(creator).approve(
                stakingContract.address,
                tokenFormat(1000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        // create by owner without sufficient amount
        {
            const tx = stakingContract.connect(creator).createRewardsPool(
                tokenReward.address,
                tokenFormat(10000),
                month
            );
            await assertErrorMessage(tx, `InsufficientBalance(${tokenFormat(10000)}, ${tokenFormat(1000)})`);
        }
        
        // approve more tokens to contract
        {
            const tx = await tokenReward.connect(creator).approve(
                stakingContract.address,
                tokenFormat(10000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        // create by owner with require amount
        {
            const balanceBefore = await tokenReward.balanceOf(creator.address);
            
            const tx = await stakingContract.connect(creator).createRewardsPool(
                tokenReward.address,
                tokenFormat(10000),
                month
            );
            const result = await tx.wait();
            
            expect(result.status).to.be.equal(1);
            
            const event = findEvent<RewardPoolCreatedEvent>(result, 'RewardPoolCreated');
            expect(event.args.rewardToken).to.be.equal(tokenReward.address);
            expect(event.args.amount).to.be.equal(tokenFormat(10000));
            expect(event.args.timespan).to.be.equal(month);
            
            const balanceAfter = await tokenReward.balanceOf(creator.address);
            const delta = balanceBefore.sub(balanceAfter);
            expect(delta).to.be.equal(tokenFormat(10000));
        }
    });
    
    it('Creates proper pools', async() => {
        // approve tokens to contract
        {
            const tx = await tokenReward.connect(creator).approve(
                stakingContract.address,
                tokenFormat(10000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        // create by owner with require amount
        {
            const balanceBefore = await tokenReward.balanceOf(creator.address);
            
            const tx = await stakingContract.connect(creator).createRewardsPool(
                tokenReward.address,
                tokenFormat(10000),
                month
            );
            const result = await tx.wait();
            
            expect(result.status).to.be.equal(1);
            
            const rewardPools = await stakingContract.rewardPools(0);
            expect(rewardPools.token).to.be.equal(tokenReward.address);
            expect(rewardPools.unspentAmount).to.be.equal(tokenFormat(10000));
            expect(rewardPools.rewardPerSecond).to.be.equal(tokenFormat(10000).div(month));
            expect(rewardPools.lastDistributionAt).to.be.equal(0);
            expect(rewardPools.expiresAt).to.be.equal(0);
            expect(rewardPools.timespan).to.be.equal(month);
        }
    });
    
    it('Modify reward pool params only by owner', async() => {
        // approve tokens to contract
        {
            const tx = await tokenReward.connect(creator).approve(
                stakingContract.address,
                tokenFormat(10000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        // create by owner with require amount
        {
            const tx = await stakingContract.connect(creator).createRewardsPool(
                tokenReward.address,
                tokenFormat(10000),
                10000
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        // try to create by non owner
        {
            const tx = stakingContract.connect(alice).modifyRewardPool(
                0,
                1000
            );
            await assertErrorMessage(tx, 'Ownable: caller is not the owner');
        }
        
        // modify by owner
        {
            const tx = await stakingContract.connect(creator).modifyRewardPool(
                0,
                1000
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
            
            const event = findEvent<RewardPoolModifiedEvent>(result, 'RewardPoolModified');
            expect(event.args.poolIdx).to.be.equal(0);
            expect(event.args.timespan).to.be.equal(1000);
        }
        
        // wrong timespan
        {
            const tx = stakingContract.connect(creator).modifyRewardPool(
                1,
                0
            );
            await assertErrorMessage(tx, 'WrongTimespan()');
        }
        
        // wrong pool id
        {
            const tx = stakingContract.connect(creator).modifyRewardPool(
                1,
                1000
            );
            await assertErrorMessage(tx, 'InvalidPool()');
        }
        
        // expired pool
        {
            await mineBlock(10000);
        
            const tx = stakingContract.connect(creator).modifyRewardPool(
                0,
                1000
            );
            await assertErrorMessage(tx, 'InvalidPool()');
        }
    });
    
    it('Modify all reward pool params', async() => {
        // approve tokens to contract
        {
            const tx = await tokenReward.connect(creator).approve(
                stakingContract.address,
                tokenFormat(10000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        // create by owner with require amount
        {
            const tx = await stakingContract.connect(creator).createRewardsPool(
                tokenReward.address,
                tokenFormat(10000),
                10000
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        // try to create by non owner
        {
            const tx = stakingContract.connect(alice).modifyAllRewardPools(1000);
            await assertErrorMessage(tx, 'Ownable: caller is not the owner');
        }
        
        // modify by owner
        {
            const tx = await stakingContract.connect(creator).modifyAllRewardPools(1000);
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
            
            const event = findEvent<RewardPoolModifiedEvent>(result, 'RewardPoolModified');
            expect(event.args.poolIdx).to.be.equal(0);
            expect(event.args.timespan).to.be.equal(1000);
        }
        
        // wrong timespan
        {
            const tx = stakingContract.connect(creator).modifyAllRewardPools(0);
            await assertErrorMessage(tx, 'WrongTimespan()');
        }
    });
    
    it('Change stake limits only by owner', async() => {
        // try to create by non owner
        {
            const tx = stakingContract.connect(alice).changeStakeLimits(
                tokenFormat(10000),
                tokenFormat(10),
                tokenFormat(1000)
            );
            await assertErrorMessage(tx, 'Ownable: caller is not the owner');
        }
        
        // modify by owner
        {
            const tx = await stakingContract.connect(creator).changeStakeLimits(
                tokenFormat(10000),
                tokenFormat(10),
                tokenFormat(1000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
    });
    
    it('Should properly change stake limits', async() => {
        const tx = await stakingContract.connect(creator).changeStakeLimits(
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
        const totalStakeLimit = await stakingContract.totalStakeLimit();
        expect(totalStakeLimit).to.be.equal(tokenFormat(10000));
        
        const minStakePerAccount = await stakingContract.minStakePerAccount();
        expect(minStakePerAccount).to.be.equal(tokenFormat(10));
        
        const maxStakePerAccount = await stakingContract.maxStakePerAccount();
        expect(maxStakePerAccount).to.be.equal(tokenFormat(1000));
    });
    
    it('Change early withdrawals params only by owner', async() => {
        // try to create by non owner
        {
            const tx = stakingContract.connect(alice).changeEarlyWithdrawalParams(
                1000,
                10 ** 4
            );
            await assertErrorMessage(tx, 'Ownable: caller is not the owner');
        }
        
        // modify by owner
        {
            const tx = await stakingContract.connect(creator).changeEarlyWithdrawalParams(
                1000,
                10 ** 4
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
    });
    
    it('Should properly change early withdrawals params', async() => {
        const tx = await stakingContract.connect(creator).changeEarlyWithdrawalParams(
            1000,
            10 ** 4
        );
        const result = await tx.wait();
        expect(result.status).to.be.equal(1);
        
        // check event
        const event = findEvent<EarlyWithdrawalParamsChangedEvent>(result, 'EarlyWithdrawalParamsChanged');
        expect(event.args.minStakeTime).to.be.equal(1000);
        expect(event.args.earlyWithdrawalSlashRatePermill).to.be.equal(10 ** 4);
        
        // check state
        const minStakeTime = await stakingContract.minStakeTime();
        expect(minStakeTime).to.be.equal(1000);
        
        const earlyWithdrawalSlashRatePermill = await stakingContract.earlyWithdrawalSlashRatePermill();
        expect(earlyWithdrawalSlashRatePermill).to.be.equal(10 ** 4);
    });
});
